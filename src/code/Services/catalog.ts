/* object-type: CodeBlock */
// Published resource catalog. Only the currently listed version surfaces here: an on-shelf
// resource stays visible even when a newer draft version exists. Visibility is enforced per
// resource scope: public → everyone, department → that department's members, private → the
// owner only. Platform admins see everything.

export interface CatalogDepartment {
  id: string;
  name: string;
}
export interface CatalogActor {
  userId: string;
  userName: string;
  isAdmin: boolean;
  departments: CatalogDepartment[];
}
export interface CatalogVersion {
  id: string;
  versionNo: number;
  changelog: string;
  deliveryMode: string;
  externalUrl: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  reviewedByUserName: string;
  reviewedAt: string;
}
export interface CatalogItem {
  id: string;
  versionId: string;
  name: string;
  summary: string;
  categoryId: string;
  categoryName: string;
  scope: string;
  departmentId: string;
  departmentName: string;
  ownerUserId: string;
  ownerUserName: string;
  tags: string;
  quickInstallEnabled: boolean;
  downloadCount: number;
  versionNo: number;
  updatedAt: string;
  deliveryMode: string;
  externalUrl: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  changelog: string;
}
export interface CatalogDetail extends CatalogItem {
  usageGuide: string;
  integrationGuide: string;
  quickInstallPrompt: string;
  versions: CatalogVersion[];
}
export interface CatalogPage {
  items: CatalogItem[];
  total: number;
  page: number;
  pageSize: number;
}
interface CatalogRow {
  id: string;
  versionId: string | null;
  name: string;
  summary: string | null;
  categoryId: string;
  categoryName: string | null;
  scope: string;
  departmentId: string | null;
  departmentName: string | null;
  ownerUserId: string;
  ownerUserName: string;
  tags: string | null;
  quickInstallEnabled: number;
  downloadCount: number;
  versionNo: number;
  updatedAt: string;
  deliveryMode: string | null;
  externalUrl: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  changelog: string | null;
}
const CATALOG_SQL = `SELECT r.Id AS id, r.Name AS name, r.Summary AS summary, r.CategoryId AS categoryId,
       r.CategoryName AS categoryName, r.Scope AS scope, r.DepartmentId AS departmentId,
       r.DepartmentName AS departmentName, r.OwnerUserId AS ownerUserId,
       r.OwnerUserName AS ownerUserName, r.Tags AS tags,
       r.QuickInstallEnabled AS quickInstallEnabled, r.DownloadCount AS downloadCount,
       r.PublishedVersionNo AS versionNo,
       r.UpdatedAt AS updatedAt, v.Id AS versionId, v.DeliveryMode AS deliveryMode,
       v.ExternalUrl AS externalUrl,
       v.FilePath AS filePath, v.FileName AS fileName, v.FileSize AS fileSize,
       v.Changelog AS changelog
  FROM Resources r
  LEFT JOIN ResourceVersions v ON v.ResourceId = r.Id AND v.VersionNo = r.PublishedVersionNo
 WHERE r.PublishedVersionNo > 0 AND r.ShelfStatus = 'listed'`;
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
function toItem(row: CatalogRow): CatalogItem {
  return {
    id: String(row.id || ""),
    versionId: String(row.versionId || ""),
    name: String(row.name || ""),
    summary: String(row.summary || ""),
    categoryId: String(row.categoryId || ""),
    categoryName: String(row.categoryName || ""),
    scope: String(row.scope || "private"),
    departmentId: String(row.departmentId || ""),
    departmentName: String(row.departmentName || ""),
    ownerUserId: String(row.ownerUserId || ""),
    ownerUserName: String(row.ownerUserName || ""),
    tags: String(row.tags || ""),
    quickInstallEnabled: Number(row.quickInstallEnabled) === 1,
    downloadCount: Number(row.downloadCount) || 0,
    versionNo: Number(row.versionNo) || 0,
    updatedAt: String(row.updatedAt || ""),
    deliveryMode: String(row.deliveryMode || "external"),
    externalUrl: String(row.externalUrl || ""),
    filePath: String(row.filePath || ""),
    fileName: String(row.fileName || ""),
    fileSize: Number(row.fileSize) || 0,
    changelog: String(row.changelog || "")
  };
}
function isWildcard(actor: CatalogActor): boolean {
  return Boolean(actor && actor.isAdmin === true);
}
function inDepartment(actor: CatalogActor, departmentId: string): boolean {
  if (!actor || !actor.departments || !departmentId) {
    return false;
  }
  for (const department of actor.departments) {
    if (String(department.id) === departmentId) {
      return true;
    }
  }
  return false;
}
export interface CatalogVisibilityInput {
  ownerUserId: string;
  scope: string;
  departmentId: string;
}

/** Scope rules: owner first, then admin, then public, then department membership. */
export function isVisibleTo(item: CatalogVisibilityInput, actor: CatalogActor): boolean {
  if (!actor || !actor.userId) {
    return false;
  }
  if (item.ownerUserId === actor.userId) {
    return true;
  }
  if (isWildcard(actor)) {
    return true;
  }
  if (item.scope === "public") {
    return true;
  }
  if (item.scope === "department") {
    return inDepartment(actor, item.departmentId);
  }
  return false;
}
function collectIds(nodes: any[], targetId: string, ids: string[]): boolean {
  for (const node of nodes || []) {
    if (String(node.id) === targetId) {
      collectAll(node, ids);
      return true;
    }
    if (collectIds(node.children, targetId, ids)) {
      return true;
    }
  }
  return false;
}
function collectAll(node: any, ids: string[]): void {
  ids.push(String(node.id));
  for (const child of node.children || []) {
    collectAll(child, ids);
  }
}

/** Category subtree ids, resolved from the live category tree. */
function categoryScopeIds(categoryId: string, tree: any[]): string[] {
  const ids: string[] = [];
  collectIds(tree, categoryId, ids);
  return ids;
}
export function listCatalog(actor: CatalogActor, filters: unknown, tree: any[]): CatalogPage {
  const input = readBody(filters);
  const keyword = input ? readText(input.keyword) : "";
  const scope = input ? readText(input.scope) : "";
  const categoryId = input ? readText(input.categoryId) : "";
  const page = input ? readInt(input.page, 1) : 1;
  const pageSize = input ? readInt(input.pageSize, 300) : 300;
  let allowedIds: string[] = [];
  if (categoryId) {
    allowedIds = categoryScopeIds(categoryId, tree);
    if (allowedIds.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        pageSize
      };
    }
  }
  let sql = `${CATALOG_SQL}`;
  const params: {
    [key: string]: unknown;
  } = {};
  if (keyword) {
    sql += ` AND (r.Name LIKE @keyword OR r.Summary LIKE @keyword OR r.Tags LIKE @keyword OR r.OwnerUserName LIKE @keyword)`;
    params.keyword = `%${keyword}%`;
  }
  if (scope) {
    sql += ` AND r.Scope = @scope`;
    params.scope = scope;
  }
  sql += ` ORDER BY r.UpdatedAt DESC LIMIT 500`;
  const rows = k.DB.sqlite.query(sql, params);
  const items: CatalogItem[] = [];
  for (const row of (rows || []) as CatalogRow[]) {
    const item = toItem(row);
    if (!isVisibleTo(item, actor)) {
      continue;
    }
    if (allowedIds.length > 0 && allowedIds.indexOf(item.categoryId) < 0) {
      continue;
    }
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
export function readCatalogItem(id: string, actor: CatalogActor): CatalogDetail | null {
  const rows = k.DB.sqlite.query(`${CATALOG_SQL} AND r.Id = @id LIMIT 1`, {
    id
  });
  if (!rows || rows.length === 0) {
    return null;
  }
  const item = toItem(rows[0] as CatalogRow);
  if (!isVisibleTo(item, actor)) {
    return null;
  }
  const guideRows = k.DB.sqlite.query(`SELECT UsageGuide AS usageGuide, IntegrationGuide AS integrationGuide, QuickInstallPrompt AS quickInstallPrompt
           FROM Resources WHERE Id = @id LIMIT 1`, {
    id
  });
  const guide = guideRows && guideRows.length > 0 ? guideRows[0] : null;
  const versionRows = k.DB.sqlite.query(`SELECT Id AS id, VersionNo AS versionNo, Changelog AS changelog, DeliveryMode AS deliveryMode,
                ExternalUrl AS externalUrl, FilePath AS filePath, FileName AS fileName,
                FileSize AS fileSize, ReviewedByUserName AS reviewedByUserName, ReviewedAt AS reviewedAt
           FROM ResourceVersions
          WHERE ResourceId = @id AND Status = 'published'
          ORDER BY VersionNo DESC`, {
    id
  });
  const versions: CatalogVersion[] = [];
  for (const row of (versionRows || []) as Record<string, unknown>[]) {
    versions.push({
      id: String(row.id || ""),
      versionNo: Number(row.versionNo) || 0,
      changelog: String(row.changelog || ""),
      deliveryMode: String(row.deliveryMode || "external"),
      externalUrl: String(row.externalUrl || ""),
      filePath: String(row.filePath || ""),
      fileName: String(row.fileName || ""),
      fileSize: Number(row.fileSize) || 0,
      reviewedByUserName: String(row.reviewedByUserName || ""),
      reviewedAt: String(row.reviewedAt || "")
    });
  }
  return {
    id: item.id,
    versionId: item.versionId,
    name: item.name,
    summary: item.summary,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    scope: item.scope,
    departmentId: item.departmentId,
    departmentName: item.departmentName,
    ownerUserId: item.ownerUserId,
    ownerUserName: item.ownerUserName,
    tags: item.tags,
    quickInstallEnabled: item.quickInstallEnabled,
    downloadCount: item.downloadCount,
    versionNo: item.versionNo,
    updatedAt: item.updatedAt,
    deliveryMode: item.deliveryMode,
    externalUrl: item.externalUrl,
    filePath: item.filePath,
    fileName: item.fileName,
    fileSize: item.fileSize,
    changelog: item.changelog,
    usageGuide: guide ? String(guide.usageGuide || "") : "",
    integrationGuide: guide ? String(guide.integrationGuide || "") : "",
    quickInstallPrompt: guide ? String(guide.quickInstallPrompt || "") : "",
    versions
  };
}