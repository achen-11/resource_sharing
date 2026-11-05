//@k-url /api/app/catalog/{action}
/* object-type: API */
// Route: /api/app/catalog/{action}. Read-only catalog of published resources;
// scope visibility is enforced in Services.catalog.
import { listCatalog, readCatalogItem } from "code/Services/catalog";
import { CatalogDepartment } from "code/Services/catalog";
import { listCategories } from "code/Services/category";
import { getCurrentIdentity } from "code/Services/user";
import { errorResponse, successResponse } from "code/Utils/response";
const ZERO_GUID = "00000000-0000-0000-0000-000000000000";
function readDepartments(): CatalogDepartment[] {
  const result: CatalogDepartment[] = [];
  const user = k.account.user.current;
  const departments = user && user.departments ? user.departments : [];
  for (const department of departments) {
    const id = String(department.Id || "");
    const name = String(department.Name || "");
    if (!id || !name || id === ZERO_GUID) {
      continue;
    }
    let seen = false;
    for (const existing of result) {
      if (existing.id === id) {
        seen = true;
      }
    }
    if (!seen) {
      result.push({
        id,
        name
      });
    }
  }
  return result;
}
function readActor() {
  const identity = getCurrentIdentity();
  if (!identity) {
    return null;
  }
  return {
    userId: String(identity.koobooUserId || identity.id),
    userName: identity.userName,
    isAdmin: identity.isAdmin === true,
    departments: readDepartments()
  };
}
k.api.post("list", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const tree = listCategories();
  return successResponse(listCatalog(actor, body, tree as unknown as unknown[]));
});
k.api.post("detail", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const id = typeof input.id === "string" ? input.id : "";
  if (!id) {
    return errorResponse(400, "INVALID_ARGUMENT", "缺少资源标识");
  }
  const item = readCatalogItem(id, actor);
  if (!item) {
    return errorResponse(404, "NOT_FOUND", "这个资源不存在，或者你还没有访问权限");
  }
  return successResponse(item);
});
k.api.get(() => k.api.notFound());