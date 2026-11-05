//@k-url /api/app/shelf/{action}
/* object-type: API */
// Route: /api/app/shelf/{action}. Take a listed resource off the catalog or put it back.
// Allowed for the resource owner and for accounts with review authority over it.
import { listShelf, setShelf } from "code/Services/shelf";
import { resolveReviewActor } from "code/Services/review";
import { errorResponse, successResponse } from "code/Utils/response";
k.api.post("list", (body: unknown) => {
  const actor = resolveReviewActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  return successResponse(listShelf(actor, body));
});
k.api.post("unlist", (body: unknown) => {
  const actor = resolveReviewActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const result = setShelf(body, actor, false);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  return successResponse(result.item);
});
k.api.post("relist", (body: unknown) => {
  const actor = resolveReviewActor();
  if (!actor) {
    return errorResponse(401, "UNAUTHENTICATED", "请先登录");
  }
  const result = setShelf(body, actor, true);
  if (!result.ok) {
    return errorResponse(400, "INVALID_ARGUMENT", result.message);
  }
  return successResponse(result.item);
});
k.api.get(() => k.api.notFound());