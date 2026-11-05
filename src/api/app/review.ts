//@k-url /api/app/review/{action}
/* object-type: API */
// Route: /api/app/review/{action}. Review authority is resolved per resource in
// Services.review; this layer only adapts identity, parameters and responses.
import { approveVersion, listPendingReviews, listReviewed, readReviewDetail, rejectVersion, resolveReviewActor } from "code/Services/review";
import { errorResponse, successResponse } from "code/Utils/response";
const readActor = resolveReviewActor;
function readId(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "";
  }
  const input = body as Record<string, unknown>;
  return typeof input.versionId === "string" ? input.versionId : "";
}
k.api.post("list", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  return successResponse(listPendingReviews(actor, body));
});
k.api.post("history", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  return successResponse(listReviewed(actor, body));
});
k.api.post("detail", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const versionId = readId(body);
  if (!versionId) {
    return errorResponse(400, "INVALID_ARGUMENT", "缺少版本标识");
  }
  const item = readReviewDetail(versionId, actor);
  if (!item) {
    return errorResponse(404, "NOT_FOUND", "这个版本不存在，或者你没有审核权限");
  }
  return successResponse(item);
});
k.api.post("approve", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const result = approveVersion(body, actor);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  return successResponse(result.item);
});
k.api.post("reject", (body: unknown) => {
  const actor = readActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const result = rejectVersion(body, actor);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  return successResponse(result.item);
});
k.api.get(() => k.api.notFound());