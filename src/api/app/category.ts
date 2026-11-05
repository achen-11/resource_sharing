//@k-url /api/app/category/{action}
/* object-type: API */
// Route: /api/app/category/{action}. Categories are shared reference data:
// every signed-in user may read them; writes require the "category.manage" permission.
import { createCategory, deleteCategory, listCategories, updateCategory } from "code/Services/category";
import { hasPermission } from "code/Services/access";
import { getCurrentIdentity } from "code/Services/user";
import { errorResponse, successResponse } from "code/Utils/response";
function readActor() {
  const identity = getCurrentIdentity();
  if (!identity) {
    return null;
  }
  return {
    userId: identity.koobooUserId || identity.id,
    userName: identity.userName,
    isAdmin: identity.isAdmin === true
  };
}
k.api.get("/", () => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  return successResponse({
    items: listCategories()
  });
});
k.api.post("create", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  if (!hasPermission("category.manage")) {
    return errorResponse(403, "FORBIDDEN", "缺少分类管理权限");
  }
  const result = createCategory(body, actor);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  return successResponse(result.item);
});
k.api.post("update", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  if (!hasPermission("category.manage")) {
    return errorResponse(403, "FORBIDDEN", "缺少分类管理权限");
  }
  const result = updateCategory(body, actor);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  return successResponse(result.item);
});
k.api.post("delete", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  if (!hasPermission("category.manage")) {
    return errorResponse(403, "FORBIDDEN", "缺少分类管理权限");
  }
  const result = deleteCategory(body, actor);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  return successResponse(result.item);
});
k.api.get(() => k.api.notFound());