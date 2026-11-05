/* object-type: CodeBlock */
// Authenticated downloads for hosted artifacts. The browser never receives a /__kb/kfile
// URL: every hosted artifact goes through app.download, which re-checks visibility here.
import { isVisibleTo } from "code/Services/catalog";
import { CatalogVisibilityInput } from "code/Services/catalog";
import { reviewAuthority } from "code/Services/review";
import { ReviewActor } from "code/Services/review";
import { belongsToResource } from "code/Services/storage";
export interface DownloadTarget {
  ok: boolean;
  message: string;
  status: number;
  filePath: string;
  fileName: string;
  contentType: string;
  resourceId: string;
  resourceName: string;
  versionId: string;
  versionNo: number;
  scope: string;
  departmentId: string;
}
interface DownloadRow {
  versionId: string;
  resourceId: string;
  versionNo: number;
  deliveryMode: string;
  filePath: string | null;
  fileName: string | null;
  status: string;
  resourceName: string;
  scope: string;
  departmentId: string | null;
  ownerUserId: string;
  publishedVersionNo: number;
  shelfStatus: string;
}
const DOWNLOAD_SQL = `SELECT v.Id AS versionId, v.ResourceId AS resourceId, v.VersionNo AS versionNo,
       v.DeliveryMode AS deliveryMode, v.FilePath AS filePath, v.FileName AS fileName, v.Status AS status,
       r.Name AS resourceName, r.Scope AS scope, r.DepartmentId AS departmentId,
       r.OwnerUserId AS ownerUserId, r.PublishedVersionNo AS publishedVersionNo,
       r.ShelfStatus AS shelfStatus
  FROM ResourceVersions v
  JOIN Resources r ON r.Id = v.ResourceId`;
export function contentTypeFor(path: string): string {
  const lower = String(path || "").toLowerCase();
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz") || lower.endsWith(".gz")) return "application/gzip";
  if (lower.endsWith(".7z")) return "application/x-7z-compressed";
  if (lower.endsWith(".rar")) return "application/vnd.rar";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".md") || lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}
function baseName(path: string): string {
  const text = String(path || "");
  const index = text.lastIndexOf("/");
  return index >= 0 ? text.substring(index + 1) : text;
}

/** Shelf values must be exactly "listed" / "unlisted"; strip stray quotes defensively. */
function normalizeShelfStatus(value: unknown): string {
  const text = String(value || "").replace(/['"]/g, "").trim().toLowerCase();
  return text === "unlisted" ? "unlisted" : "listed";
}
export function denyDownload(message: string, status: number): DownloadTarget {
  return {
    ok: false,
    message,
    status,
    filePath: "",
    fileName: "",
    contentType: "application/octet-stream",
    resourceId: "",
    resourceName: "",
    versionId: "",
    versionNo: 0,
    scope: "",
    departmentId: ""
  };
}
function toTarget(row: DownloadRow): DownloadTarget {
  const filePath = String(row.filePath || "");
  const fileName = String(row.fileName || "") || baseName(filePath);
  return {
    ok: true,
    message: "",
    status: 200,
    filePath,
    fileName,
    contentType: contentTypeFor(filePath),
    resourceId: String(row.resourceId || ""),
    resourceName: String(row.resourceName || ""),
    versionId: String(row.versionId || ""),
    versionNo: Number(row.versionNo) || 0,
    scope: String(row.scope || ""),
    departmentId: String(row.departmentId || "")
  };
}
function canReachOtherVersions(row: DownloadRow, actor: ReviewActor): boolean {
  if (String(row.ownerUserId) === actor.userId) {
    return true;
  }
  return reviewAuthority(String(row.scope || "private"), String(row.departmentId || ""), actor) !== "";
}

/** Resolve one hosted version for the current actor, or a denial reason. */
export function resolveVersionDownload(versionId: string, actor: ReviewActor | null): DownloadTarget {
  if (!actor) {
    return denyDownload("请先登录", 401);
  }
  if (!versionId) {
    return denyDownload("缺少版本标识", 400);
  }
  const rows = k.DB.sqlite.query(`${DOWNLOAD_SQL} WHERE v.Id = @versionId LIMIT 1`, {
    versionId
  });
  if (!rows || rows.length === 0) {
    return denyDownload("文件不存在，或者你没有下载权限", 404);
  }
  const row = rows[0] as DownloadRow;
  if (String(row.deliveryMode) !== "hosted") {
    return denyDownload("这个版本使用外部链接，请打开原始地址下载", 400);
  }
  if (!String(row.filePath || "")) {
    return denyDownload("这个版本还没有上传文件", 404);
  }
  const listedCurrent = Number(row.publishedVersionNo) === Number(row.versionNo) && normalizeShelfStatus(row.shelfStatus) === "listed";
  if (listedCurrent) {
    const scopeInput: CatalogVisibilityInput = {
      ownerUserId: String(row.ownerUserId || ""),
      scope: String(row.scope || "private"),
      departmentId: String(row.departmentId || "")
    };
    if (!isVisibleTo(scopeInput, actor)) {
      return denyDownload("你没有下载这个资源的权限", 404);
    }
  } else if (!canReachOtherVersions(row, actor)) {
    // Draft, pending, rejected or off-shelf versions are limited to the owner and reviewers.
    return denyDownload("这个版本还没有上架，只有维护人和审核人可以下载", 404);
  }
  if (!k.file.exists(String(row.filePath))) {
    return denyDownload("文件已经不在服务器上，请联系维护人重新上传", 404);
  }
  return toTarget(row);
}

/** Owner-only check before a freshly uploaded file becomes a version (upload verification). */
export function resolveUploadCheck(path: string, resourceId: string, actor: ReviewActor | null): DownloadTarget {
  if (!actor) {
    return denyDownload("请先登录", 401);
  }
  if (!path || !resourceId) {
    return denyDownload("缺少文件标识", 400);
  }
  const rows = k.DB.sqlite.query(`SELECT Name AS name, OwnerUserId AS ownerUserId FROM Resources WHERE Id = @id LIMIT 1`, {
    id: resourceId
  });
  if (!rows || rows.length === 0) {
    return denyDownload("资源不存在", 404);
  }
  const row = rows[0] as Record<string, unknown>;
  const ownerUserId = String(row.ownerUserId || "");
  if (ownerUserId !== actor.userId && actor.isAdmin !== true) {
    return denyDownload("只能查看自己上传的文件", 404);
  }
  if (!belongsToResource(path, resourceId)) {
    return denyDownload("这个文件不属于该资源", 404);
  }
  if (!k.file.exists(path)) {
    return denyDownload("文件已经不存在，请重新上传", 404);
  }
  return {
    ok: true,
    message: "",
    status: 200,
    filePath: path,
    fileName: baseName(path),
    contentType: contentTypeFor(path),
    resourceId,
    resourceName: String(row.name || ""),
    versionId: "",
    versionNo: 0,
    scope: "",
    departmentId: ""
  };
}

/** Append a download record and bump the counter. Never blocks the download itself. */
export function recordDownload(target: DownloadTarget, actor: ReviewActor | null): void {
  if (!target || !target.ok || !actor || !target.versionId) {
    return;
  }
  try {
    k.DB.sqlite.execute(`INSERT INTO ResourceDownloads (
               Id, ResourceId, ResourceName, VersionId, VersionNo, UserId, UserName,
               Scope, DepartmentId, ClientIp, CreatedAt
             ) VALUES (
               @id, @resourceId, @resourceName, @versionId, @versionNo, @userId, @userName,
               @scope, @departmentId, @clientIp, @now
             )`, {
      id: k.security.newGuid(),
      resourceId: target.resourceId,
      resourceName: target.resourceName,
      versionId: target.versionId,
      versionNo: target.versionNo,
      userId: actor.userId,
      userName: actor.userName || "",
      scope: target.scope,
      departmentId: target.departmentId,
      clientIp: String(k.request.clientIp || ""),
      now: new Date().toISOString()
    });
    k.DB.sqlite.execute(`UPDATE Resources SET DownloadCount = DownloadCount + 1 WHERE Id = @id`, {
      id: target.resourceId
    });
  } catch {
    // Download analytics must never break the transfer.
  }
}