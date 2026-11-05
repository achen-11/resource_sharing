/* object-type: CodeBlock */
// Time-limited download links for hosted artifacts, so an AI tool running outside the
// browser session can fetch the package. A token bypasses authentication only: the version
// must still be published, current and listed, so unlisting a resource revokes it at once.
import { contentTypeFor, denyDownload } from "code/Services/download";
import { DownloadTarget } from "code/Services/download";
import { resolveVersionDownload } from "code/Services/download";
import { ReviewActor } from "code/Services/review";
export interface DownloadTokenResult {
  ok: boolean;
  message: string;
  token: string;
  url: string;
  expiresAt: string;
  resourceName: string;
  fileName: string;
  versionNo: number;
}
export interface DownloadTokenTarget {
  target: DownloadTarget;
  creatorUserId: string;
  creatorUserName: string;
}
const DEFAULT_HOURS = 72;
const MAX_HOURS = 720;
function readBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}
function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function readInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}
function tokenFailure(message: string): DownloadTokenResult {
  return {
    ok: false,
    message,
    token: "",
    url: "",
    expiresAt: "",
    resourceName: "",
    fileName: "",
    versionNo: 0
  };
}

/** Normalized shelf values: exactly "listed" / "unlisted". */
function isListed(value: unknown): boolean {
  return String(value || "").replace(/['"]/g, "").trim().toLowerCase() !== "unlisted";
}

/** Creates a download link for one hosted version the actor may already download. */
export function createDownloadToken(body: unknown, actor: ReviewActor | null): DownloadTokenResult {
  if (!actor || !actor.userId) {
    return tokenFailure("请先登录");
  }
  const input = readBody(body);
  if (!input) {
    return tokenFailure("请求格式不正确");
  }
  const versionId = readText(input.versionId);
  if (!versionId) {
    return tokenFailure("缺少版本标识");
  }

  // Reuse the download rules: nobody can mint a link they could not use themselves.
  const target = resolveVersionDownload(versionId, actor);
  if (!target.ok) {
    return tokenFailure(target.message);
  }
  const hours = Math.min(readInt(input.hours, DEFAULT_HOURS), MAX_HOURS);
  const token = k.security.newGuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + hours * 3600 * 1000).toISOString();
  k.DB.sqlite.execute(`INSERT INTO ResourceDownloadTokens (
           Id, ResourceId, ResourceName, VersionId, VersionNo, ExpiresAt,
           CreatedByUserId, CreatedByUserName, CreatedAt, LastUsedAt
         ) VALUES (
           @id, @resourceId, @resourceName, @versionId, @versionNo, @expiresAt,
           @createdByUserId, @createdByUserName, @createdAt, NULL
         )`, {
    id: token,
    resourceId: target.resourceId,
    resourceName: target.resourceName,
    versionId: target.versionId,
    versionNo: target.versionNo,
    expiresAt,
    createdByUserId: String(actor.userId),
    createdByUserName: String(actor.userName || ""),
    createdAt: now.toISOString()
  });
  return {
    ok: true,
    message: "已生成下载链接",
    token,
    url: `/api/app/download?token=${token}`,
    expiresAt,
    resourceName: target.resourceName,
    fileName: target.fileName,
    versionNo: target.versionNo
  };
}

/** Resolves a token to a downloadable file, or a denial. Marks the token as used. */
export function resolveDownloadToken(token: string): DownloadTokenTarget {
  const empty: DownloadTokenTarget = {
    target: denyDownload("下载链接无效或已过期", 404),
    creatorUserId: "",
    creatorUserName: ""
  };
  const value = readText(token);
  if (!value) {
    return empty;
  }
  const rows = k.DB.sqlite.query(`SELECT t.ResourceId AS resourceId, t.ResourceName AS resourceName, t.VersionId AS versionId,
                t.VersionNo AS versionNo, t.ExpiresAt AS expiresAt,
                t.CreatedByUserId AS createdByUserId, t.CreatedByUserName AS createdByUserName,
                v.DeliveryMode AS deliveryMode, v.FilePath AS filePath, v.FileName AS fileName,
                v.Status AS versionStatus, r.PublishedVersionNo AS publishedVersionNo,
                r.ShelfStatus AS shelfStatus, r.Scope AS scope, r.DepartmentId AS departmentId
           FROM ResourceDownloadTokens t
           LEFT JOIN ResourceVersions v ON v.Id = t.VersionId
           LEFT JOIN Resources r ON r.Id = t.ResourceId
          WHERE t.Id = @token LIMIT 1`, {
    token: value
  });
  if (!rows || rows.length === 0) {
    return empty;
  }
  const row = rows[0] as Record<string, unknown>;
  const expiresAt = String(row.expiresAt || "");
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    return {
      target: denyDownload("下载链接已过期，请重新生成", 410),
      creatorUserId: "",
      creatorUserName: ""
    };
  }
  const creatorUserId = String(row.createdByUserId || "");
  const creatorUserName = String(row.createdByUserName || "");
  const versionId = String(row.versionId || "");
  const filePath = String(row.filePath || "");
  const versionNo = Number(row.versionNo) || 0;
  const denied = (message: string, status: number): DownloadTokenTarget => ({
    target: denyDownload(message, status),
    creatorUserId,
    creatorUserName
  });
  if (String(row.deliveryMode || "") !== "hosted" || !filePath) {
    return denied("这个版本没有可下载的托管文件", 404);
  }
  if (String(row.versionStatus || "") !== "published") {
    return denied("这个版本已经不在发布状态", 404);
  }
  if (Number(row.publishedVersionNo) !== versionNo) {
    return denied("这个版本已经不是当前发布版本", 404);
  }
  if (!isListed(row.shelfStatus)) {
    return denied("这个资源已下架", 404);
  }
  if (!k.file.exists(filePath)) {
    return denied("文件已经不在服务器上，请联系维护人重新上传", 404);
  }
  k.DB.sqlite.execute(`UPDATE ResourceDownloadTokens SET LastUsedAt = @now WHERE Id = @token`, {
    now: new Date().toISOString(),
    token: value
  });
  const target: DownloadTarget = {
    ok: true,
    message: "",
    status: 200,
    filePath,
    fileName: String(row.fileName || "") || filePath.substring(filePath.lastIndexOf("/") + 1),
    contentType: contentTypeFor(filePath),
    resourceId: String(row.resourceId || ""),
    resourceName: String(row.resourceName || ""),
    versionId,
    versionNo,
    scope: String(row.scope || ""),
    departmentId: String(row.departmentId || "")
  };
  return {
    target,
    creatorUserId,
    creatorUserName
  };
}