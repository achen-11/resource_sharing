/* object-type: CodeBlock */
// Shelf control: take a listed resource off the catalog, or put it back.
// Allowed for the resource owner and for accounts with review authority over the resource.
// Re-listing restores the same published version and does not require a new review.
import { reviewAuthority } from "code/Services/review";
import { ReviewActor } from "code/Services/review";
import { recordActivity } from "code/Services/activity";
import { notifyResourceOwner, scopeLabel } from "code/Services/notify";
export interface ShelfItem {
  id: string;
  name: string;
  summary: string;
  categoryName: string;
  scope: string;
  departmentId: string;
  departmentName: string;
  ownerUserId: string;
  ownerUserName: string;
  publishedVersionNo: number;
  shelfStatus: string;
  latestVersionNo: number;
  latestVersionStatus: string;
  updatedAt: string;
  authority: string;
}
export interface ShelfResult {
  ok: boolean;
  message: string;
  item: ShelfItem | null;
}
export interface ShelfPage {
  items: ShelfItem[];
  total: number;
  page: number;
  pageSize: number;
}
interface ShelfRow {
  id: string;
  name: string;
  summary: string | null;
  categoryName: string | null;
  scope: string;
  departmentId: string | null;
  departmentName: string | null;
  ownerUserId: string;
  ownerUserName: string;
  publishedVersionNo: number;
  shelfStatus: string;
  latestVersionNo: number;
  latestVersionStatus: string;
  updatedAt: string;
}
const SHELF_SQL = `SELECT Id AS id, Name AS name, Summary AS summary, CategoryName AS categoryName,
       Scope AS scope, DepartmentId AS departmentId, DepartmentName AS departmentName,
       OwnerUserId AS ownerUserId, OwnerUserName AS ownerUserName,
       PublishedVersionNo AS publishedVersionNo, ShelfStatus AS shelfStatus,
       LatestVersionNo AS latestVersionNo, LatestVersionStatus AS latestVersionStatus,
       UpdatedAt AS updatedAt
  FROM Resources WHERE PublishedVersionNo > 0`;
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

/** Shelf values must be exactly "listed" / "unlisted"; strip stray quotes defensively. */
function normalizeShelfStatus(value: unknown): string {
  const text = String(value || "").replace(/['"]/g, "").trim().toLowerCase();
  return text === "unlisted" ? "unlisted" : "listed";
}

/** "维护人" or the review authority label; "" when the actor may not change the shelf state. */
function authorityOf(row: ShelfRow, actor: ReviewActor): string {
  if (!actor || !actor.userId) {
    return "";
  }
  if (String(row.ownerUserId) === actor.userId) {
    return "维护人";
  }
  return reviewAuthority(String(row.scope || ""), String(row.departmentId || ""), actor);
}
function toItem(row: ShelfRow, authority: string): ShelfItem {
  return {
    id: String(row.id || ""),
    name: String(row.name || ""),
    summary: String(row.summary || ""),
    categoryName: String(row.categoryName || ""),
    scope: String(row.scope || "private"),
    departmentId: String(row.departmentId || ""),
    departmentName: String(row.departmentName || ""),
    ownerUserId: String(row.ownerUserId || ""),
    ownerUserName: String(row.ownerUserName || ""),
    publishedVersionNo: Number(row.publishedVersionNo) || 0,
    shelfStatus: normalizeShelfStatus(row.shelfStatus),
    latestVersionNo: Number(row.latestVersionNo) || 0,
    latestVersionStatus: String(row.latestVersionStatus || "none"),
    updatedAt: String(row.updatedAt || ""),
    authority
  };
}
function readShelfRow(id: string): ShelfRow | null {
  const rows = k.DB.sqlite.query(`${SHELF_SQL} AND Id = @id LIMIT 1`, {
    id
  });
  if (!rows || rows.length === 0) {
    return null;
  }
  return rows[0] as ShelfRow;
}
function failure(message: string): ShelfResult {
  return {
    ok: false,
    message,
    item: null
  };
}

/** Resources the actor may take off the shelf or put back, newest first. */
export function listShelf(actor: ReviewActor, filters: unknown): ShelfPage {
  const input = readBody(filters);
  const keyword = input ? readText(input.keyword) : "";
  const shelf = input ? readText(input.shelf) : "";
  const page = input ? readInt(input.page, 1) : 1;
  const pageSize = input ? readInt(input.pageSize, 200) : 200;
  const params: {
    [key: string]: unknown;
  } = {};
  let sql = `${SHELF_SQL}`;
  if (keyword) {
    sql += ` AND (Name LIKE @keyword OR Summary LIKE @keyword OR OwnerUserName LIKE @keyword)`;
    params.keyword = `%${keyword}%`;
  }
  if (shelf === "listed" || shelf === "unlisted") {
    sql += ` AND ShelfStatus = @shelf`;
    params.shelf = shelf;
  }
  sql += ` ORDER BY UpdatedAt DESC LIMIT 500`;
  const rows = k.DB.sqlite.query(sql, params);
  const items: ShelfItem[] = [];
  for (const row of (rows || []) as ShelfRow[]) {
    const authority = authorityOf(row, actor);
    if (!authority) {
      continue;
    }
    items.push(toItem(row, authority));
  }
  // Authority is resolved per row, so the reachable total is counted after filtering.
  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize
  };
}
export function setShelf(body: unknown, actor: ReviewActor, listed: boolean): ShelfResult {
  const input = readBody(body);
  if (!input) {
    return failure("请求格式不正确");
  }
  const id = readText(input.id);
  if (!id) {
    return failure("缺少资源标识");
  }
  const row = readShelfRow(id);
  if (!row) {
    return failure("这个资源还没有上架过");
  }
  const authority = authorityOf(row, actor);
  if (!authority) {
    return failure("你没有管理这个资源上架状态的权限");
  }
  const target = listed ? "listed" : "unlisted";
  if (normalizeShelfStatus(row.shelfStatus) === target) {
    return failure(listed ? "这个资源已经在架上了" : "这个资源已经是下架状态");
  }
  if (listed) {
    const versionRows = k.DB.sqlite.query(`SELECT Status AS status FROM ResourceVersions
              WHERE ResourceId = @resourceId AND VersionNo = @versionNo LIMIT 1`, {
      resourceId: id,
      versionNo: row.publishedVersionNo
    });
    const version = versionRows && versionRows.length > 0 ? versionRows[0] : null;
    if (!version || String(version.status) !== "published") {
      return failure("上架版本已失效，请重新送审一个新版本");
    }
  }
  const now = new Date().toISOString();
  k.DB.sqlite.execute(`UPDATE Resources SET ShelfStatus = @shelf, UpdatedAt = @now WHERE Id = @id`, {
    shelf: target,
    now,
    id
  });
  recordActivity({
    resourceId: id,
    resourceName: String(row.name || ""),
    action: listed ? "shelf.relist" : "shelf.unlist",
    actionLabel: listed ? "恢复上架" : "下架",
    fromStatus: normalizeShelfStatus(row.shelfStatus),
    toStatus: target,
    detail: authority
  }, actor);
  notifyResourceOwner(row.ownerUserId, {
    type: listed ? "shelf.listed" : "shelf.unlisted",
    title: listed ? `资源已恢复上架：${row.name}` : `资源已下架：${row.name}`,
    message: `${actor && actor.userName ? actor.userName : "审核人"}${listed ? "把资源恢复上架了" : "把资源下架了"} · ${scopeLabel(row.scope, row.departmentName || "")}`,
    actionUrl: `/my-resources/${id}`
  }, actor && actor.userId ? actor.userId : "");
  row.shelfStatus = target;
  row.updatedAt = now;
  return {
    ok: true,
    message: listed ? "已恢复上架" : "已下架",
    item: toItem(row, authority)
  };
}