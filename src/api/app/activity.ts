//@k-url /api/app/activity/{action}
/* object-type: API */
// Route: /api/app/activity/{action}. Read-only audit trail for resource governance actions.
import { listActivities } from "code/Services/activity";
import { resolveReviewActor } from "code/Services/review";
import { errorResponse, successResponse } from "code/Utils/response";
k.api.post("list", (body: unknown) => {
  const actor = resolveReviewActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const resourceId = typeof input.resourceId === "string" ? input.resourceId.trim() : "";
  if (!resourceId) {
    return errorResponse(400, "INVALID_ARGUMENT", "缺少资源标识");
  }
  return successResponse({
    items: listActivities(resourceId, actor)
  });
});
k.api.get(() => k.api.notFound());