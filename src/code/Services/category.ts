/* object-type: CodeBlock */
// Resource category tree. Fully self-maintained: there is no fixed resource-type
// axis, so the first level of the tree is whatever the team creates.

export interface CategoryActor {
  userId: string;
  userName: string;
}
export interface CategoryNode {
  id: string;
  parentId: string;
  name: string;
  description: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserName: string;
  children: CategoryNode[];
}
export interface CategoryResult {
  ok: boolean;
  message: string;
  item: CategoryNode | null;
}
interface CategoryRow {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
  enabled: number;
  createdAt: string;
  updatedAt: string;
  createdByUserName: string | null;
}
const MAX_DEPTH = 6;
const SELECT_SQL = `SELECT Id AS id, ParentId AS parentId, Name AS name, Description AS description,
       SortOrder AS sortOrder, Enabled AS enabled, CreatedAt AS createdAt, UpdatedAt AS updatedAt,
       CreatedByUserName AS createdByUserName
  FROM ResourceCategories`;
function toNode(row: CategoryRow): CategoryNode {
  return {
    id: String(row.id || ""),
    parentId: String(row.parentId || ""),
    name: String(row.name || ""),
    description: String(row.description || ""),
    sortOrder: Number(row.sortOrder) || 0,
    enabled: Number(row.enabled) === 1,
    createdAt: String(row.createdAt || ""),
    updatedAt: String(row.updatedAt || ""),
    createdByUserName: String(row.createdByUserName || ""),
    children: []
  };
}
function failure(message: string): CategoryResult {
  return {
    ok: false,
    message,
    item: null
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
function readSortOrder(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return -1;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!isFinite(parsed)) {
    return -1;
  }
  const rounded = Math.round(parsed);
  if (rounded < 0 || rounded > 9999) {
    return -1;
  }
  return rounded;
}
function readEnabled(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function readAll(): CategoryRow[] {
  const rows = k.DB.sqlite.query(`${SELECT_SQL} ORDER BY SortOrder ASC, Name ASC`, {});
  return (rows || []) as CategoryRow[];
}
function readNode(id: string): CategoryNode | null {
  const rows = k.DB.sqlite.query(`${SELECT_SQL} WHERE Id = @id LIMIT 1`, {
    id
  });
  if (!rows || rows.length === 0) {
    return null;
  }
  return toNode(rows[0] as CategoryRow);
}

/** Whole tree, children sorted the same way as roots. */
export function listCategories(): CategoryNode[] {
  const rows = readAll();
  const byId: {
    [key: string]: CategoryNode;
  } = {};
  const order: string[] = [];
  for (const row of rows) {
    const node = toNode(row);
    byId[node.id] = node;
    order.push(node.id);
  }
  const roots: CategoryNode[] = [];
  for (const id of order) {
    const node = byId[id];
    const parent = node.parentId ? byId[node.parentId] : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
function findNode(nodes: CategoryNode[], id: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const found = findNode(node.children, id);
    if (found) {
      return found;
    }
  }
  return null;
}
function heightOf(node: CategoryNode): number {
  let height = 1;
  for (const child of node.children) {
    const childHeight = 1 + heightOf(child);
    if (childHeight > height) {
      height = childHeight;
    }
  }
  return height;
}
function depthOf(id: string): number {
  let depth = 0;
  let currentId = id;
  const guard: {
    [key: string]: boolean;
  } = {};
  while (currentId && !guard[currentId]) {
    guard[currentId] = true;
    const node = readNode(currentId);
    if (!node) {
      break;
    }
    depth = depth + 1;
    currentId = node.parentId;
  }
  return depth;
}
function isDescendant(candidateId: string, ancestorId: string): boolean {
  let currentId = candidateId;
  const guard: {
    [key: string]: boolean;
  } = {};
  while (currentId && !guard[currentId]) {
    if (currentId === ancestorId) {
      return true;
    }
    guard[currentId] = true;
    const node = readNode(currentId);
    if (!node) {
      return false;
    }
    currentId = node.parentId;
  }
  return false;
}
function nameTaken(parentId: string, name: string, excludeId: string): boolean {
  const rows = k.DB.sqlite.query(`SELECT Id FROM ResourceCategories
          WHERE COALESCE(ParentId, '') = @parentId AND lower(Name) = lower(@name) AND Id <> @id
          LIMIT 1`, {
    parentId,
    name,
    id: excludeId
  });
  return rows && rows.length > 0;
}
function nextSortOrder(parentId: string): number {
  const value = k.DB.sqlite.value(`SELECT MAX(SortOrder) FROM ResourceCategories WHERE COALESCE(ParentId, '') = @parentId`, {
    parentId
  });
  const current = Number(value);
  return isFinite(current) ? current + 10 : 0;
}
export function createCategory(body: unknown, actor: CategoryActor): CategoryResult {
  const input = readBody(body);
  if (!input) {
    return failure("分类信息格式不正确");
  }
  const name = readText(input.name);
  if (!name) {
    return failure("请输入分类名称");
  }
  if (name.length > 40) {
    return failure("分类名称不能超过 40 个字符");
  }
  const description = readText(input.description);
  if (description.length > 200) {
    return failure("分类说明不能超过 200 个字符");
  }
  const parentId = readText(input.parentId);
  if (parentId) {
    const parent = readNode(parentId);
    if (!parent) {
      return failure("上级分类不存在或已被删除");
    }
    if (depthOf(parentId) >= MAX_DEPTH) {
      return failure(`分类最多支持 ${MAX_DEPTH} 级`);
    }
  }
  if (nameTaken(parentId, name, "")) {
    return failure("同一级下已存在同名分类");
  }
  let sortOrder = nextSortOrder(parentId);
  if (input.sortOrder !== undefined) {
    sortOrder = readSortOrder(input.sortOrder);
    if (sortOrder < 0) {
      return failure("排序值须为 0 到 9999 的整数");
    }
  }
  const id = k.security.newGuid();
  const now = new Date().toISOString();
  k.DB.sqlite.execute(`INSERT INTO ResourceCategories (
           Id, ParentId, Name, Description, SortOrder, Enabled,
           CreatedAt, UpdatedAt, CreatedByUserId, CreatedByUserName
         ) VALUES (
           @id, @parentId, @name, @description, @sortOrder, @enabled,
           @now, @now, @createdByUserId, @createdByUserName
         )`, {
    id,
    parentId,
    name,
    description,
    sortOrder,
    enabled: readEnabled(input.enabled, true) ? 1 : 0,
    now,
    createdByUserId: actor ? actor.userId : "",
    createdByUserName: actor ? actor.userName : ""
  });
  const item = readNode(id);
  if (!item) {
    return failure("分类保存失败，请重试");
  }
  return {
    ok: true,
    message: "已保存",
    item
  };
}
export function updateCategory(body: unknown, actor: CategoryActor): CategoryResult {
  const input = readBody(body);
  if (!input) {
    return failure("分类信息格式不正确");
  }
  const id = readText(input.id);
  if (!id) {
    return failure("缺少分类标识");
  }
  const existing = readNode(id);
  if (!existing) {
    return failure("分类不存在或已被删除");
  }
  const name = readText(input.name);
  if (!name) {
    return failure("请输入分类名称");
  }
  if (name.length > 40) {
    return failure("分类名称不能超过 40 个字符");
  }
  const description = readText(input.description);
  if (description.length > 200) {
    return failure("分类说明不能超过 200 个字符");
  }
  const parentId = readText(input.parentId);
  if (parentId) {
    if (parentId === id) {
      return failure("不能把分类挂到自己下面");
    }
    if (!readNode(parentId)) {
      return failure("上级分类不存在或已被删除");
    }
    if (isDescendant(parentId, id)) {
      return failure("不能移动到自己的子分类下面");
    }
  }
  if (nameTaken(parentId, name, id)) {
    return failure("同一级下已存在同名分类");
  }
  const movingNode = findNode(listCategories(), id);
  const movingHeight = movingNode ? heightOf(movingNode) : 1;
  if (parentId && depthOf(parentId) + movingHeight > MAX_DEPTH) {
    return failure(`分类最多支持 ${MAX_DEPTH} 级`);
  }
  const parentChanged = (existing.parentId || "") !== parentId;
  let sortOrder = existing.sortOrder;
  if (input.sortOrder === undefined) {
    sortOrder = parentChanged ? nextSortOrder(parentId) : existing.sortOrder;
  } else {
    sortOrder = readSortOrder(input.sortOrder);
    if (sortOrder < 0) {
      return failure("排序值须为 0 到 9999 的整数");
    }
  }
  const now = new Date().toISOString();
  k.DB.sqlite.execute(`UPDATE ResourceCategories
            SET ParentId = @parentId, Name = @name, Description = @description,
                SortOrder = @sortOrder, Enabled = @enabled, UpdatedAt = @now
          WHERE Id = @id`, {
    id,
    parentId,
    name,
    description,
    sortOrder,
    enabled: readEnabled(input.enabled, existing.enabled) ? 1 : 0,
    now
  });
  const item = readNode(id);
  if (!item) {
    return failure("分类保存失败，请重试");
  }
  return {
    ok: true,
    message: "已保存",
    item
  };
}
export function deleteCategory(body: unknown, actor: CategoryActor): CategoryResult {
  const input = readBody(body);
  if (!input) {
    return failure("分类信息格式不正确");
  }
  const id = readText(input.id);
  if (!id) {
    return failure("缺少分类标识");
  }
  const existing = readNode(id);
  if (!existing) {
    return failure("分类不存在或已被删除");
  }
  const childCount = Number(k.DB.sqlite.value(`SELECT COUNT(*) FROM ResourceCategories WHERE COALESCE(ParentId, '') = @id`, {
    id
  })) || 0;
  if (childCount > 0) {
    return failure("这个分类下还有子分类，请先处理子分类");
  }

  // Leaf-only deletion: categories that still have children must be cleaned up first.
  k.DB.sqlite.execute(`DELETE FROM ResourceCategories WHERE Id = @id`, {
    id
  });
  return {
    ok: true,
    message: "已删除",
    item: existing
  };
}