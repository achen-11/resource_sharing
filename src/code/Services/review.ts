/* object-type: CodeBlock */
// Review queue: pending resource versions and the approve / reject transitions.
// Review authority is computed per resource: platform admins, app reviewers, and the
// manager of the owning department for department-scoped resources.
import { hasPermission } from "code/Services/access";
import { getCurrentIdentity } from "code/Services/user";
import { notifyResourceOwner } from "code/Services/notify";
export interface ReviewDepartment {
  id: string;
  name: string;
  isManager: boolean;
}
export interface ReviewActor {
  userId: string;
  userName: string;
  isAdmin: boolean;
  permissions: string[];
  departments: ReviewDepartment[];
}
export interface ReviewItem {
  versionId: string;
  resourceId: string;
  resourceName: string;
  summary: string;
  categoryId: string;
  categoryName: string;
  scope: string;
  departmentId: string;
  departmentName: string;
  ownerUserId: string;
  ownerUserName: string;
  quickInstallEnabled: boolean;
  versionNo: number;
  changelog: string;
  deliveryMode: string;
  externalUrl: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  status: string;
  submittedByUserName: string;
  submittedAt: string;
  reviewedByUserName: string;
  reviewedAt: string;
  reviewComment: string;
  authority: string;
}
export interface ReviewDetail extends ReviewItem {
  usageGuide: string;
  integrationGuide: string;
  quickInstallPrompt: string;
  latestVersionNo: number;
  latestVersionStatus: string;
}
export interface ReviewResult {
  ok: boolean;
  message: string;
  item: ReviewItem | null;
}
export interface ReviewPage {
  items: ReviewItem[];
  total: number;
  page: number;
  pageSize: number;
}
interface ReviewRow {
  versionId: string;
  resourceId: string;
  resourceName: string;
  summary: string | null;
  categoryId: string;
  categoryName: string | null;
  scope: string;
  departmentId: string | null;
  departmentName: string | null;
  ownerUserId: string;
  ownerUserName: string;
  quickInstallEnabled: number;
  versionNo: number;
  changelog: string | null;
  deliveryMode: string;
  externalUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  status: string;
  submittedByUserName: string | null;
  submittedAt: string | null;
  reviewedByUserName: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  latestVersionNo: number;
  latestVersionStatus: string;
}
const REVIEW_SQL = `SELECT v.Id AS versionId, v.ResourceId AS resourceId, v.VersionNo AS versionNo,
       v.Changelog AS changelog, v.DeliveryMode AS deliveryMode, v.ExternalUrl AS externalUrl,
       v.FilePath AS filePath, v.FileName AS fileName, v.FileSize AS fileSize, v.Status AS status,
       v.SubmittedByUserName AS submittedByUserName, v.SubmittedAt AS submittedAt,
       v.ReviewedByUserName AS reviewedByUserName, v.ReviewedAt AS reviewedAt,
       v.ReviewComment AS reviewComment,
       r.Name AS resourceName, r.Summary AS summary, r.CategoryId AS categoryId,
       r.CategoryName AS categoryName, r.Scope AS scope, r.DepartmentId AS departmentId,
       r.DepartmentName AS departmentName, r.OwnerUserId AS ownerUserId,
       r.OwnerUserName AS ownerUserName, r.QuickInstallEnabled AS quickInstallEnabled,
       r.LatestVersionNo AS latestVersionNo, r.LatestVersionStatus AS latestVersionStatus
  FROM ResourceVersions v
  JOIN Resources r ON r.Id = v.ResourceId`;
const ZERO_GUID = "00000000-0000-0000-0000-000000000000";
function readDepartments(userId: string): ReviewDepartment[] {
  const result: ReviewDepartment[] = [];
  const user = k.account.user.current;
  const departments = user && user.departments ? user.departments : [];
  for (const department of departments) {
    const id = String(department.Id || "");
    const name = String(department.Name || "");
    if (!id || !name || id === ZERO_GUID) {
      continue;
    }
    let isManager = false;
    const members = department.Users ? department.Users : [];
    for (const member of members) {
      const memberId = String(member.Id || "");
      if (memberId && memberId === userId && member.IsManager === true) {
        isManager = true;
      }
    }
    let merged = false;
    for (const existing of result) {
      if (existing.id === id) {
        merged = true;
        if (isManager) {
          existing.isManager = true;
        }
      }
    }
    if (!merged) {
      result.push({
        id,
        name,
        isManager
      });
    }
  }
  return result;
}

/** Review authority label for one resource, or "" when the actor may not review it. */
export function reviewAuthority(scope: string, departmentId: string, actor: ReviewActor): string {
  return authorityFor(scope, departmentId, actor);
}

/** Current account as a review actor, or null when not signed in. */
export function resolveReviewActor(): ReviewActor | null {
  const identity = getCurrentIdentity();
  if (!identity) {
    return null;
  }
  const userId = String(identity.koobooUserId || identity.id);
  return {
    userId,
    userName: identity.userName,
    isAdmin: identity.isAdmin === true,
    permissions: identity.permissions || [],
    departments: readDepartments(userId)
  };
}
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
function toItem(row: ReviewRow): ReviewItem {
  return {
    versionId: String(row.versionId || ""),
    resourceId: String(row.resourceId || ""),
    resourceName: String(row.resourceName || ""),
    summary: String(row.summary || ""),
    categoryId: String(row.categoryId || ""),
    categoryName: String(row.categoryName || ""),
    scope: String(row.scope || "private"),
    departmentId: String(row.departmentId || ""),
    departmentName: String(row.departmentName || ""),
    ownerUserId: String(row.ownerUserId || ""),
    ownerUserName: String(row.ownerUserName || ""),
    quickInstallEnabled: Number(row.quickInstallEnabled) === 1,
    versionNo: Number(row.versionNo) || 0,
    changelog: String(row.changelog || ""),
    deliveryMode: String(row.deliveryMode || "external"),
    externalUrl: String(row.externalUrl || ""),
    filePath: String(row.filePath || ""),
    fileName: String(row.fileName || ""),
    fileSize: Number(row.fileSize) || 0,
    status: String(row.status || "pending"),
    submittedByUserName: String(row.submittedByUserName || ""),
    submittedAt: String(row.submittedAt || ""),
    reviewedByUserName: String(row.reviewedByUserName || ""),
    reviewedAt: String(row.reviewedAt || ""),
    reviewComment: String(row.reviewComment || ""),
    authority: ""
  };
}
function findDepartment(actor: ReviewActor, departmentId: string): ReviewDepartment | null {
  if (!actor || !actor.departments) {
    return null;
  }
  for (const department of actor.departments) {
    if (String(department.id) === departmentId) {
      return department;
    }
  }
  return null;
}
function isWildcard(actor: ReviewActor): boolean {
  if (!actor) {
    return false;
  }
  if (actor.isAdmin === true) {
    return true;
  }
  return actor.permissions.indexOf("*") >= 0;
}

/** Why this actor may review the resource, or "" when they may not. */
function authorityFor(scope: string, departmentId: string, actor: ReviewActor): string {
  if (!actor) {
    return "";
  }
  if (isWildcard(actor)) {
    return "平台管理员";
  }
  if (!hasPermission("resource.review", actor.permissions)) {
    return "";
  }
  if (scope === "department") {
    const department = findDepartment(actor, departmentId);
    if (!department || department.isManager !== true) {
      return "";
    }
    return `部门管理员 · ${department.name}`;
  }
  return "审核人";
}
function readRow(versionId: string): ReviewRow | null {
  const rows = k.DB.sqlite.query(`${REVIEW_SQL} WHERE v.Id = @versionId LIMIT 1`, {
    versionId
  });
  if (!rows || rows.length === 0) {
    return null;
  }
  return rows[0] as ReviewRow;
}

/** Pending versions this actor is allowed to review, oldest submission first. */
export function listPendingReviews(actor: ReviewActor, filters: unknown): ReviewPage {
  const input = readBody(filters);
  const keyword = input ? readText(input.keyword) : "";
  const scope = input ? readText(input.scope) : "";
  const page = input ? readInt(input.page, 1) : 1;
  const pageSize = input ? readInt(input.pageSize, 200) : 200;
  const params: {
    [key: string]: unknown;
  } = {};
  let sql = `${REVIEW_SQL} WHERE v.Status = 'pending'`;
  if (keyword) {
    sql += ` AND (r.Name LIKE @keyword OR r.Summary LIKE @keyword OR r.OwnerUserName LIKE @keyword)`;
    params.keyword = `%${keyword}%`;
  }
  if (scope) {
    sql += ` AND r.Scope = @scope`;
    params.scope = scope;
  }
  sql += ` ORDER BY v.SubmittedAt ASC LIMIT 500`;
  const rows = k.DB.sqlite.query(sql, params);
  const items: ReviewItem[] = [];
  for (const row of (rows || []) as ReviewRow[]) {
    const item = toItem(row);
    const authority = authorityFor(item.scope, item.departmentId, actor);
    if (!authority) {
      continue;
    }
    item.authority = authority;
    items.push(item);
  }
  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize
  };
}

/** Versions this actor has already approved or rejected. */
export function listReviewed(actor: ReviewActor, filters: unknown): ReviewPage {
  const input = readBody(filters);
  const page = input ? readInt(input.page, 1) : 1;
  const pageSize = input ? readInt(input.pageSize, 50) : 50;
  if (!actor || !actor.userName) {
    return {
      items: [],
      total: 0,
      page,
      pageSize
    };
  }
  const rows = k.DB.sqlite.query(`${REVIEW_SQL} WHERE v.ReviewedByUserName = @userName ORDER BY v.ReviewedAt DESC LIMIT 500`, {
    userName: actor.userName
  });
  const items: ReviewItem[] = [];
  for (const row of (rows || []) as ReviewRow[]) {
    const item = toItem(row);
    item.authority = authorityFor(item.scope, item.departmentId, actor);
    items.push(item);
  }
  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize
  };
}
export function readReviewDetail(versionId: string, actor: ReviewActor): ReviewDetail | null {
  const row = readRow(versionId);
  if (!row) {
    return null;
  }
  const base = toItem(row);
  const authority = authorityFor(base.scope, base.departmentId, actor);
  if (!authority) {
    return null;
  }
  const guides = k.DB.sqlite.query(`SELECT UsageGuide AS usageGuide, IntegrationGuide AS integrationGuide, QuickInstallPrompt AS quickInstallPrompt
           FROM Resources WHERE Id = @id LIMIT 1`, {
    id: base.resourceId
  });
  const guide = guides && guides.length > 0 ? guides[0] : null;
  return {
    versionId: base.versionId,
    resourceId: base.resourceId,
    resourceName: base.resourceName,
    summary: base.summary,
    categoryId: base.categoryId,
    categoryName: base.categoryName,
    scope: base.scope,
    departmentId: base.departmentId,
    departmentName: base.departmentName,
    ownerUserId: base.ownerUserId,
    ownerUserName: base.ownerUserName,
    quickInstallEnabled: base.quickInstallEnabled,
    versionNo: base.versionNo,
    changelog: base.changelog,
    deliveryMode: base.deliveryMode,
    externalUrl: base.externalUrl,
    filePath: base.filePath,
    fileName: base.fileName,
    fileSize: base.fileSize,
    status: base.status,
    submittedByUserName: base.submittedByUserName,
    submittedAt: base.submittedAt,
    reviewedByUserName: base.reviewedByUserName,
    reviewedAt: base.reviewedAt,
    reviewComment: base.reviewComment,
    authority,
    usageGuide: guide ? String(guide.usageGuide || "") : "",
    integrationGuide: guide ? String(guide.integrationGuide || "") : "",
    quickInstallPrompt: guide ? String(guide.quickInstallPrompt || "") : "",
    latestVersionNo: Number(row.latestVersionNo) || 0,
    latestVersionStatus: String(row.latestVersionStatus || "")
  };
}
function failure(message: string): ReviewResult {
  return {
    ok: false,
    message,
    item: null
  };
}
function readDecision(body: unknown): Record<string, unknown> | null {
  return readBody(body);
}
export function approveVersion(body: unknown, actor: ReviewActor): ReviewResult {
  const input = readDecision(body);
  if (!input) {
    return failure("请求格式不正确");
  }
  const versionId = readText(input.versionId);
  if (!versionId) {
    return failure("缺少版本标识");
  }
  const row = readRow(versionId);
  if (!row) {
    return failure("版本不存在");
  }
  const item = toItem(row);
  if (!authorityFor(item.scope, item.departmentId, actor)) {
    return failure("你没有审核这个资源的权限");
  }
  if (item.status !== "pending") {
    return failure("这条提交已经处理过了");
  }
  const comment = readText(input.comment);
  if (comment.length > 500) {
    return failure("审核意见不能超过 500 个字符");
  }
  const now = new Date().toISOString();
  const reviewer = actor ? String(actor.userName || "") : "";
  k.DB.sqlite.execute(`UPDATE ResourceVersions
            SET Status = 'published', ReviewedByUserName = @reviewer, ReviewedAt = @now,
                ReviewComment = @comment, UpdatedAt = @now
          WHERE Id = @id AND Status = 'pending'`, {
    id: versionId,
    reviewer,
    comment,
    now
  });
  k.DB.sqlite.execute(`UPDATE Resources
            SET LatestVersionStatus = 'published', PublishedVersionNo = @versionNo,
                ShelfStatus = 'listed', UpdatedAt = @now
          WHERE Id = @id`, {
    id: item.resourceId,
    versionNo: item.versionNo,
    now
  });
  notifyResourceOwner(item.ownerUserId, {
    type: "review.approved",
    title: `资源已通过审核：${item.resourceName} v${item.versionNo}`,
    message: `${reviewer || "审核人"} 通过了你的提交，资源已上架到目录`,
    actionUrl: `/catalog/${item.resourceId}`
  }, actor && actor.userId ? actor.userId : "");
  item.status = "published";
  item.reviewedByUserName = reviewer;
  item.reviewedAt = now;
  item.reviewComment = comment;
  return {
    ok: true,
    message: "已通过并上架",
    item
  };
}
export function rejectVersion(body: unknown, actor: ReviewActor): ReviewResult {
  const input = readDecision(body);
  if (!input) {
    return failure("请求格式不正确");
  }
  const versionId = readText(input.versionId);
  if (!versionId) {
    return failure("缺少版本标识");
  }
  const row = readRow(versionId);
  if (!row) {
    return failure("版本不存在");
  }
  const item = toItem(row);
  if (!authorityFor(item.scope, item.departmentId, actor)) {
    return failure("你没有审核这个资源的权限");
  }
  if (item.status !== "pending") {
    return failure("这条提交已经处理过了");
  }
  const comment = readText(input.comment);
  if (!comment) {
    return failure("请填写驳回原因，方便提交人修改");
  }
  if (comment.length > 500) {
    return failure("审核意见不能超过 500 个字符");
  }
  const now = new Date().toISOString();
  const reviewer = actor ? String(actor.userName || "") : "";
  k.DB.sqlite.execute(`UPDATE ResourceVersions
            SET Status = 'rejected', ReviewedByUserName = @reviewer, ReviewedAt = @now,
                ReviewComment = @comment, UpdatedAt = @now
          WHERE Id = @id AND Status = 'pending'`, {
    id: versionId,
    reviewer,
    comment,
    now
  });
  k.DB.sqlite.execute(`UPDATE Resources SET LatestVersionStatus = 'rejected', UpdatedAt = @now WHERE Id = @id`, {
    id: item.resourceId,
    now
  });
  notifyResourceOwner(item.ownerUserId, {
    type: "review.rejected",
    title: `资源被驳回：${item.resourceName} v${item.versionNo}`,
    message: `${reviewer || "审核人"}：${comment}`,
    actionUrl: `/my-resources/${item.resourceId}`
  }, actor && actor.userId ? actor.userId : "");
  item.status = "rejected";
  item.reviewedByUserName = reviewer;
  item.reviewedAt = now;
  item.reviewComment = comment;
  return {
    ok: true,
    message: "已驳回",
    item
  };
}