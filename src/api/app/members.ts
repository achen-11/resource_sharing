//@k-url /api/app/members/{action}
/* object-type: API */
// Route: /api/app/members/{action}. App-internal roles only: accounts and
// departments stay owned by the Kooboo organization, we only store role assignment.
import { hasPermission } from "code/Services/access";
import { APP_ROLES, assignRole, listMembers } from "code/Services/appRole";
import { getCurrentIdentity } from "code/Services/user";
import { errorResponse, successResponse } from "code/Utils/response";
function readActor() {
  const identity = getCurrentIdentity();
  if (!identity) {
    return null;
  }
  return {
    koobooUserId: identity.koobooUserId || identity.id,
    userName: identity.userName
  };
}
k.api.get("/", () => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  if (!hasPermission("member.manage")) {
    return errorResponse(403, "FORBIDDEN", "缺少成员管理权限");
  }
  return successResponse({
    roles: APP_ROLES,
    items: listMembers(),
    currentUserId: actor.koobooUserId
  });
});
k.api.post("assign-role", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  if (!hasPermission("member.manage")) {
    return errorResponse(403, "FORBIDDEN", "缺少成员管理权限");
  }
  const result = assignRole(body, actor);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  return successResponse({
    ok: true
  });
});
k.api.get(() => k.api.notFound());