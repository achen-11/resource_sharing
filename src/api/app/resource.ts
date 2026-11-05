//@k-url /api/app/resource/{action}
/* object-type: API */
// Route: /api/app/resource/{action}. Resource writes are owner-scoped:
// every signed-in user manages only their own resources (platform admins may manage any).
import { deleteResource, listMyResources, readResource, saveResource, saveVersion, submitVersion } from "code/Services/resource";
import { ResourceDepartment } from "code/Services/resource";
import { recordUploadedFile, saveUpload } from "code/Services/storage";
import { getCurrentIdentity } from "code/Services/user";
import { errorResponse, successResponse } from "code/Utils/response";
function readDepartments(): ResourceDepartment[] {
  const result: ResourceDepartment[] = [];
  const user = k.account.user.current;
  const departments = user && user.departments ? user.departments : [];
  for (const department of departments) {
    const id = String(department.Id || "");
    const name = String(department.Name || "");
    if (!id || !name || id === "00000000-0000-0000-0000-000000000000") {
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
    userId: identity.koobooUserId || identity.id,
    userName: identity.userName,
    isAdmin: identity.isAdmin === true,
    departments: readDepartments()
  };
}
k.api.post("meta", () => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  return successResponse({
    departments: actor.departments
  });
});
k.api.post("list", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  return successResponse(listMyResources(actor, body));
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
  const item = readResource(id, actor);
  if (!item) {
    return errorResponse(404, "NOT_FOUND", "资源不存在，或者不属于当前账号");
  }
  return successResponse(item);
});
k.api.post("save", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const result = saveResource(body, actor);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  return successResponse(result.item);
});
k.api.post("version-save", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const result = saveVersion(body, actor);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  return successResponse(result.item);
});
k.api.post("upload", () => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const form = k.request.form;
  const resourceId = form && form["resourceId"] ? String(form["resourceId"]) : "";
  if (!resourceId) {
    return errorResponse(400, "INVALID_ARGUMENT", "缺少资源标识");
  }
  if (!readResource(resourceId, actor)) {
    return errorResponse(403, "FORBIDDEN", "只能给自己登记的资源上传文件");
  }
  if (!k.request.files || k.request.files.length === 0) {
    return errorResponse(400, "INVALID_ARGUMENT", "没有收到文件");
  }
  const result = saveUpload(k.request.files[0], resourceId);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  recordUploadedFile(result.file, resourceId, actor);
  return successResponse(result.file);
});
k.api.post("version-submit", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const result = submitVersion(body, actor);
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
  const result = deleteResource(body, actor);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  return successResponse(result.item);
});
k.api.get(() => k.api.notFound());