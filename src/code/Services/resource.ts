/* object-type: CodeBlock */
// Shared resources: basic info + guides + quick-install prompt, plus reviewable versions.
import { listCategories } from "code/Services/category";
import { CategoryNode } from "code/Services/category";
import { belongsToResource, deleteResourceFiles, markFileUsed } from "code/Services/storage";
import { recordActivity } from "code/Services/activity";
import { notifyReviewers, scopeLabel } from "code/Services/notify";
export interface ResourceDepartment {
  id: string;
  name: string;
}
export interface ResourceActor {
  userId: string;
  userName: string;
  isAdmin: boolean;
  departments: ResourceDepartment[];
}
export interface ResourceVersionItem {
  id: string;
  resourceId: string;
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
  createdAt: string;
}
export interface ResourceListItem {
  id: string;
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
  latestVersionNo: number;
  latestVersionStatus: string;
  publishedVersionNo: number;
  shelfStatus: string;
  versionCount: number;
  createdAt: string;
  updatedAt: string;
}
export interface ResourceDetail extends ResourceListItem {
  usageGuide: string;
  integrationGuide: string;
  quickInstallPrompt: string;
  versions: ResourceVersionItem[];
}
export interface ResourceResult {
  ok: boolean;
  message: string;
  item: ResourceListItem | null;
}
export interface ResourcePage {
  items: ResourceListItem[];
  total: number;
  page: number;
  pageSize: number;
}
export interface VersionResult {
  ok: boolean;
  message: string;
  item: ResourceVersionItem | null;
}
const SCOPES = ["public", "private", "department"];
const DELIVERY_MODES = ["external", "hosted"];
const SUBMITTABLE_STATUSES = ["draft", "rejected"];
const NONE_STATUS = "none";
const RESOURCE_SQL = `SELECT Id AS id, Name AS name, Summary AS summary, CategoryId AS categoryId,
       CategoryName AS categoryName, Scope AS scope, DepartmentId AS departmentId,
       DepartmentName AS departmentName, OwnerUserId AS ownerUserId, OwnerUserName AS ownerUserName,
       Tags AS tags, UsageGuide AS usageGuide, IntegrationGuide AS integrationGuide,
       QuickInstallEnabled AS quickInstallEnabled, QuickInstallPrompt AS quickInstallPrompt,
       LatestVersionNo AS latestVersionNo, LatestVersionStatus AS latestVersionStatus,
       PublishedVersionNo AS publishedVersionNo, ShelfStatus AS shelfStatus,
       VersionCount AS versionCount, CreatedAt AS createdAt, UpdatedAt AS updatedAt
  FROM Resources`;
const VERSION_SQL = `SELECT Id AS id, ResourceId AS resourceId, VersionNo AS versionNo,
       Changelog AS changelog, DeliveryMode AS deliveryMode, ExternalUrl AS externalUrl,
       FilePath AS filePath, FileName AS fileName, FileSize AS fileSize, Status AS status,
       SubmittedByUserName AS submittedByUserName, SubmittedAt AS submittedAt,
       ReviewedByUserName AS reviewedByUserName, ReviewedAt AS reviewedAt,
       ReviewComment AS reviewComment, CreatedAt AS createdAt
  FROM ResourceVersions`;
interface ResourceRow {
  id: string;
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
  usageGuide: string | null;
  integrationGuide: string | null;
  quickInstallEnabled: number;
  quickInstallPrompt: string | null;
  latestVersionNo: number;
  latestVersionStatus: string;
  publishedVersionNo: number;
  shelfStatus: string;
  versionCount: number;
  createdAt: string;
  updatedAt: string;
}
interface VersionRow {
  id: string;
  resourceId: string;
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
  createdAt: string;
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
function readLongText(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function readInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return isFinite(parsed) ? Math.round(parsed) : fallback;
}

/** Shelf values must be exactly "listed" / "unlisted"; strip stray quotes defensively. */
function normalizeShelfStatus(value: unknown): string {
  const text = String(value || "").replace(/['"]/g, "").trim().toLowerCase();
  return text === "unlisted" ? "unlisted" : "listed";
}
function toListItem(row: ResourceRow): ResourceListItem {
  return {
    id: String(row.id || ""),
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
    latestVersionNo: Number(row.latestVersionNo) || 0,
    latestVersionStatus: String(row.latestVersionStatus || NONE_STATUS),
    publishedVersionNo: Number(row.publishedVersionNo) || 0,
    shelfStatus: normalizeShelfStatus(row.shelfStatus),
    versionCount: Number(row.versionCount) || 0,
    createdAt: String(row.createdAt || ""),
    updatedAt: String(row.updatedAt || "")
  };
}
function toVersionItem(row: VersionRow): ResourceVersionItem {
  return {
    id: String(row.id || ""),
    resourceId: String(row.resourceId || ""),
    versionNo: Number(row.versionNo) || 0,
    changelog: String(row.changelog || ""),
    deliveryMode: String(row.deliveryMode || "external"),
    externalUrl: String(row.externalUrl || ""),
    filePath: String(row.filePath || ""),
    fileName: String(row.fileName || ""),
    fileSize: Number(row.fileSize) || 0,
    status: String(row.status || "draft"),
    submittedByUserName: String(row.submittedByUserName || ""),
    submittedAt: String(row.submittedAt || ""),
    reviewedByUserName: String(row.reviewedByUserName || ""),
    reviewedAt: String(row.reviewedAt || ""),
    reviewComment: String(row.reviewComment || ""),
    createdAt: String(row.createdAt || "")
  };
}
function failure(message: string): ResourceResult {
  return {
    ok: false,
    message,
    item: null
  };
}
function versionFailure(message: string): VersionResult {
  return {
    ok: false,
    message,
    item: null
  };
}
function readResourceRow(id: string): ResourceRow | null {
  const rows = k.DB.sqlite.query(`${RESOURCE_SQL} WHERE Id = @id LIMIT 1`, {
    id
  });
  if (!rows || rows.length === 0) {
    return null;
  }
  return rows[0] as ResourceRow;
}
function readVersionRows(resourceId: string): ResourceVersionItem[] {
  const rows = k.DB.sqlite.query(`${VERSION_SQL} WHERE ResourceId = @resourceId ORDER BY VersionNo DESC`, {
    resourceId
  });
  const items: ResourceVersionItem[] = [];
  for (const row of (rows || []) as VersionRow[]) {
    items.push(toVersionItem(row));
  }
  return items;
}
function findCategoryNode(nodes: CategoryNode[], id: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const found = findCategoryNode(node.children, id);
    if (found) {
      return found;
    }
  }
  return null;
}
function collectSubtreeIds(nodes: CategoryNode[], id: string): string[] {
  const node = findCategoryNode(nodes, id);
  if (!node) {
    return [];
  }
  const ids: string[] = [];
  collectNodeIds(node, ids);
  return ids;
}
function collectNodeIds(node: CategoryNode, ids: string[]): void {
  ids.push(node.id);
  for (const child of node.children) {
    collectNodeIds(child, ids);
  }
}
function findDepartment(actor: ResourceActor, departmentId: string): ResourceDepartment | null {
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
function isOwner(actor: ResourceActor, row: ResourceRow): boolean {
  return Boolean(actor && actor.userId && String(row.ownerUserId) === actor.userId);
}
function canManage(actor: ResourceActor, row: ResourceRow): boolean {
  return isOwner(actor, row) || Boolean(actor && actor.isAdmin);
}

/** Resources owned by the current user, newest first. */
export function listMyResources(actor: ResourceActor, filters: unknown): ResourcePage {
  const input = readBody(filters);
  const keyword = input ? readText(input.keyword) : "";
  const status = input ? readText(input.status) : "";
  const categoryId = input ? readText(input.categoryId) : "";
  const page = input ? readInt(input.page, 1) : 1;
  const pageSize = input ? readInt(input.pageSize, 20) : 20;
  const params: {
    [key: string]: unknown;
  } = {
    ownerUserId: actor ? actor.userId : ""
  };
  let where = `OwnerUserId = @ownerUserId`;
  if (keyword) {
    where += ` AND (Name LIKE @keyword OR Summary LIKE @keyword OR Tags LIKE @keyword)`;
    params.keyword = `%${keyword}%`;
  }
  if (status) {
    where += ` AND LatestVersionStatus = @status`;
    params.status = status;
  }
  if (categoryId) {
    const ids = collectSubtreeIds(listCategories(), categoryId);
    if (ids.length === 0) {
      return {
        items: [],
        total: 0,
        page,
        pageSize
      };
    }
    const placeholders: string[] = [];
    for (let index = 0; index < ids.length; index++) {
      const key = `cid${index}`;
      params[key] = ids[index];
      placeholders.push(`@${key}`);
    }
    where += ` AND CategoryId IN (${placeholders.join(", ")})`;
  }
  const total = Number(k.DB.sqlite.value(`SELECT COUNT(*) FROM Resources WHERE ${where}`, params)) || 0;
  params.limit = pageSize;
  params.offset = (page - 1) * pageSize;
  const rows = k.DB.sqlite.query(`${RESOURCE_SQL} WHERE ${where} ORDER BY UpdatedAt DESC LIMIT @limit OFFSET @offset`, params);
  const items: ResourceListItem[] = [];
  for (const row of (rows || []) as ResourceRow[]) {
    items.push(toListItem(row));
  }
  return {
    items,
    total,
    page,
    pageSize
  };
}
export function readResource(id: string, actor: ResourceActor): ResourceDetail | null {
  const row = readResourceRow(id);
  if (!row) {
    return null;
  }
  if (!canManage(actor, row)) {
    return null;
  }
  const base = toListItem(row);
  return {
    id: base.id,
    name: base.name,
    summary: base.summary,
    categoryId: base.categoryId,
    categoryName: base.categoryName,
    scope: base.scope,
    departmentId: base.departmentId,
    departmentName: base.departmentName,
    ownerUserId: base.ownerUserId,
    ownerUserName: base.ownerUserName,
    tags: base.tags,
    quickInstallEnabled: base.quickInstallEnabled,
    latestVersionNo: base.latestVersionNo,
    latestVersionStatus: base.latestVersionStatus,
    publishedVersionNo: base.publishedVersionNo,
    shelfStatus: base.shelfStatus,
    versionCount: base.versionCount,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    usageGuide: String(row.usageGuide || ""),
    integrationGuide: String(row.integrationGuide || ""),
    quickInstallPrompt: String(row.quickInstallPrompt || ""),
    versions: readVersionRows(row.id)
  };
}
export function saveResource(body: unknown, actor: ResourceActor): ResourceResult {
  const input = readBody(body);
  if (!input) {
    return failure("资源信息格式不正确");
  }
  if (!actor || !actor.userId) {
    return failure("无法识别当前用户");
  }
  const id = readText(input.id);
  const existing = id ? readResourceRow(id) : null;
  if (id && !existing) {
    return failure("资源不存在或已被删除");
  }
  if (existing && !canManage(actor, existing)) {
    return failure("只能修改自己登记的资源");
  }
  const name = readText(input.name);
  if (!name) {
    return failure("请输入资源名称");
  }
  if (name.length > 80) {
    return failure("资源名称不能超过 80 个字符");
  }
  const summary = readText(input.summary);
  if (summary.length > 300) {
    return failure("简介不能超过 300 个字符");
  }
  const categoryId = readText(input.categoryId);
  if (!categoryId) {
    return failure("请选择资源分类");
  }
  const categoryNode = findCategoryNode(listCategories(), categoryId);
  if (!categoryNode) {
    return failure("所选分类不存在或已被删除");
  }
  const scope = readText(input.scope) || "private";
  if (SCOPES.indexOf(scope) < 0) {
    return failure("归属范围不正确");
  }
  let departmentId = "";
  let departmentName = "";
  if (scope === "department") {
    departmentId = readText(input.departmentId);
    if (!departmentId) {
      return failure("部门范围需要选择一个部门");
    }
    const department = findDepartment(actor, departmentId);
    if (department) {
      departmentName = department.name;
    } else if (existing && existing.departmentId === departmentId) {
      departmentName = String(existing.departmentName || "");
    } else {
      return failure("只能选择自己所在的部门");
    }
  }
  const tags = readText(input.tags);
  if (tags.length > 120) {
    return failure("标签不能超过 120 个字符");
  }
  const usageGuide = readLongText(input.usageGuide);
  const integrationGuide = readLongText(input.integrationGuide);
  if (usageGuide.length > 20000 || integrationGuide.length > 20000) {
    return failure("单篇文档不能超过 20000 个字符");
  }
  const quickInstallEnabled = input.quickInstallEnabled === true;
  const quickInstallPrompt = readLongText(input.quickInstallPrompt);
  if (quickInstallPrompt.length > 4000) {
    return failure("快速安装 prompt 不能超过 4000 个字符");
  }
  if (quickInstallEnabled && !quickInstallPrompt.trim()) {
    return failure("启用快速安装需要填写 prompt 模板");
  }
  const now = new Date().toISOString();
  let savedId = existing ? existing.id : "";
  if (existing) {
    k.DB.sqlite.execute(`UPDATE Resources
                SET Name = @name, Summary = @summary, CategoryId = @categoryId,
                    CategoryName = @categoryName, Scope = @scope, DepartmentId = @departmentId,
                    DepartmentName = @departmentName, Tags = @tags, UsageGuide = @usageGuide,
                    IntegrationGuide = @integrationGuide, QuickInstallEnabled = @quickInstallEnabled,
                    QuickInstallPrompt = @quickInstallPrompt, UpdatedAt = @now
              WHERE Id = @id`, {
      id: existing.id,
      name,
      summary,
      categoryId,
      categoryName: categoryNode.name,
      scope,
      departmentId,
      departmentName,
      tags,
      usageGuide,
      integrationGuide,
      quickInstallEnabled: quickInstallEnabled ? 1 : 0,
      quickInstallPrompt,
      now
    });
  } else {
    const newId = k.security.newGuid();
    savedId = newId;
    k.DB.sqlite.execute(`INSERT INTO Resources (
               Id, Name, Summary, CategoryId, CategoryName, Scope, DepartmentId, DepartmentName,
               OwnerUserId, OwnerUserName, Tags, UsageGuide, IntegrationGuide,
               QuickInstallEnabled, QuickInstallPrompt, LatestVersionNo, LatestVersionStatus,
               PublishedVersionNo, ShelfStatus, VersionCount, DownloadCount, CreatedAt, UpdatedAt
             ) VALUES (
               @id, @name, @summary, @categoryId, @categoryName, @scope, @departmentId, @departmentName,
               @ownerUserId, @ownerUserName, @tags, @usageGuide, @integrationGuide,
               @quickInstallEnabled, @quickInstallPrompt, 0, @noneStatus,
               0, @shelfListed, 0, 0, @now, @now
             )`, {
      id: newId,
      name,
      summary,
      categoryId,
      categoryName: categoryNode.name,
      scope,
      departmentId,
      departmentName,
      ownerUserId: actor.userId,
      ownerUserName: actor.userName || "",
      tags,
      usageGuide,
      integrationGuide,
      quickInstallEnabled: quickInstallEnabled ? 1 : 0,
      quickInstallPrompt,
      noneStatus: NONE_STATUS,
      shelfListed: "listed",
      now
    });
  }
  const finalRow = savedId ? readResourceRow(savedId) : null;
  if (!finalRow) {
    return failure("资源保存失败，请重试");
  }
  return {
    ok: true,
    message: "已保存",
    item: toListItem(finalRow)
  };
}
export function saveVersion(body: unknown, actor: ResourceActor): VersionResult {
  const input = readBody(body);
  if (!input) {
    return versionFailure("版本信息格式不正确");
  }
  const resourceId = readText(input.resourceId);
  if (!resourceId) {
    return versionFailure("缺少资源标识");
  }
  const resource = readResourceRow(resourceId);
  if (!resource) {
    return versionFailure("资源不存在或已被删除");
  }
  if (!canManage(actor, resource)) {
    return versionFailure("只能为自己登记的资源创建版本");
  }
  if (String(resource.latestVersionStatus) === "pending") {
    return versionFailure("当前版本正在审核中，等审核结束再发新版本");
  }
  const deliveryMode = readText(input.deliveryMode) || "external";
  if (DELIVERY_MODES.indexOf(deliveryMode) < 0) {
    return versionFailure("分发方式不正确");
  }
  let externalUrl = "";
  let filePath = "";
  let fileName = "";
  let fileSize = 0;
  if (deliveryMode === "external") {
    externalUrl = readText(input.externalUrl);
    if (!externalUrl) {
      return versionFailure("请填写资源地址");
    }
    if (!externalUrl.startsWith("http://") && !externalUrl.startsWith("https://")) {
      return versionFailure("资源地址需要以 http:// 或 https:// 开头");
    }
    if (externalUrl.length > 500) {
      return versionFailure("资源地址不能超过 500 个字符");
    }
  } else {
    filePath = readText(input.filePath);
    fileName = readText(input.fileName);
    fileSize = readInt(input.fileSize, 0);
    if (!filePath) {
      return versionFailure("请先上传资源文件");
    }
    if (!belongsToResource(filePath, resourceId)) {
      return versionFailure("文件不属于这个资源，请重新上传");
    }
    if (!k.file.exists(filePath)) {
      return versionFailure("上传的文件已不存在，请重新上传");
    }
  }
  const changelog = readText(input.changelog);
  if (changelog.length > 500) {
    return versionFailure("变更说明不能超过 500 个字符");
  }
  const nextNo = (Number(resource.latestVersionNo) || 0) + 1;
  const versionId = k.security.newGuid();
  const now = new Date().toISOString();
  k.DB.sqlite.execute(`INSERT INTO ResourceVersions (
           Id, ResourceId, VersionNo, Changelog, DeliveryMode, ExternalUrl, FilePath, FileName,
           FileSize, Status, SubmittedByUserName, SubmittedAt, ReviewedByUserName, ReviewedAt,
           ReviewComment, CreatedAt, UpdatedAt
         ) VALUES (
           @id, @resourceId, @versionNo, @changelog, @deliveryMode, @externalUrl, @filePath, @fileName,
           @fileSize, @status, '', '', '', '', '', @now, @now
         )`, {
    id: versionId,
    resourceId,
    versionNo: nextNo,
    changelog,
    deliveryMode,
    externalUrl,
    filePath,
    fileName,
    fileSize,
    status: "draft",
    now
  });
  k.DB.sqlite.execute(`UPDATE Resources
            SET LatestVersionNo = @versionNo, LatestVersionStatus = @status,
                VersionCount = VersionCount + 1, UpdatedAt = @now
          WHERE Id = @id`, {
    id: resourceId,
    versionNo: nextNo,
    status: "draft",
    now
  });
  if (filePath) {
    markFileUsed(filePath);
  }
  const versions = readVersionRows(resourceId);
  for (const version of versions) {
    if (version.id === versionId) {
      return {
        ok: true,
        message: "版本已创建",
        item: version
      };
    }
  }
  return versionFailure("版本保存失败，请重试");
}
export function submitVersion(body: unknown, actor: ResourceActor): VersionResult {
  const input = readBody(body);
  if (!input) {
    return versionFailure("请求格式不正确");
  }
  const resourceId = readText(input.resourceId);
  if (!resourceId) {
    return versionFailure("缺少资源标识");
  }
  const resource = readResourceRow(resourceId);
  if (!resource) {
    return versionFailure("资源不存在或已被删除");
  }
  if (!canManage(actor, resource)) {
    return versionFailure("只能提交自己登记的资源");
  }
  let versionNo = readInt(input.versionNo, 0);
  if (versionNo <= 0) {
    versionNo = Number(resource.latestVersionNo) || 0;
  }
  if (versionNo <= 0) {
    return versionFailure("请先创建第一个版本");
  }
  if (versionNo !== (Number(resource.latestVersionNo) || 0)) {
    return versionFailure("只能提交最新版本");
  }
  if (String(resource.latestVersionStatus) === "pending") {
    return versionFailure("当前版本已经在审核中");
  }
  if (SUBMITTABLE_STATUSES.indexOf(String(resource.latestVersionStatus)) < 0) {
    return versionFailure("当前状态不允许提交审核");
  }
  const rows = k.DB.sqlite.query(`${VERSION_SQL} WHERE ResourceId = @resourceId AND VersionNo = @versionNo LIMIT 1`, {
    resourceId,
    versionNo
  });
  if (!rows || rows.length === 0) {
    return versionFailure("版本不存在");
  }
  const version = toVersionItem(rows[0] as VersionRow);
  if (SUBMITTABLE_STATUSES.indexOf(version.status) < 0) {
    return versionFailure("当前状态不允许提交审核");
  }
  const now = new Date().toISOString();
  const actorName = actor ? String(actor.userName || "") : "";
  k.DB.sqlite.execute(`UPDATE ResourceVersions
            SET Status = @status, SubmittedByUserName = @actorName, SubmittedAt = @now, UpdatedAt = @now
          WHERE Id = @id`, {
    id: version.id,
    status: "pending",
    actorName,
    now
  });
  k.DB.sqlite.execute(`UPDATE Resources SET LatestVersionStatus = @status, UpdatedAt = @now WHERE Id = @id`, {
    id: resourceId,
    status: "pending",
    now
  });
  notifyReviewers({
    type: "review.pending",
    title: `待审核：${resource.name} v${versionNo}`,
    message: `${actorName || "维护人"}提交了 ${resource.categoryName || "未分类"} · ${scopeLabel(resource.scope, resource.departmentName || "")}`,
    actionUrl: "/review"
  });
  version.status = "pending";
  version.submittedByUserName = actorName;
  version.submittedAt = now;
  return {
    ok: true,
    message: "已提交审核",
    item: version
  };
}
export function deleteResource(body: unknown, actor: ResourceActor): ResourceResult {
  const input = readBody(body);
  if (!input) {
    return failure("请求格式不正确");
  }
  const id = readText(input.id);
  if (!id) {
    return failure("缺少资源标识");
  }
  const resource = readResourceRow(id);
  if (!resource) {
    return failure("资源不存在或已被删除");
  }
  if (!canManage(actor, resource)) {
    return failure("只能删除自己登记的资源");
  }
  const status = String(resource.latestVersionStatus);
  if (status === "pending") {
    return failure("审核中的资源不能删除");
  }
  // Listed resources stay protected; an unlisted (off-shelf) resource can be removed.
  if (Number(resource.publishedVersionNo) > 0 && String(resource.shelfStatus) === "listed") {
    return failure("资源还在架上，请先下架再删除");
  }
  const item = toListItem(resource);
  recordActivity({
    resourceId: id,
    resourceName: String(resource.name || ""),
    action: "resource.delete",
    actionLabel: "删除资源",
    fromStatus: String(resource.shelfStatus || ""),
    toStatus: "deleted",
    detail: "版本、文件与下载记录一并清理，本条审计保留"
  }, actor);
  // Download rows would otherwise outlive the resource and skew download analytics.
  k.DB.sqlite.execute(`DELETE FROM ResourceDownloads WHERE ResourceId = @id`, {
    id
  });
  k.DB.sqlite.execute(`DELETE FROM ResourceVersions WHERE ResourceId = @id`, {
    id
  });
  k.DB.sqlite.execute(`DELETE FROM Resources WHERE Id = @id`, {
    id
  });
  deleteResourceFiles(id);
  return {
    ok: true,
    message: "已删除",
    item
  };
}