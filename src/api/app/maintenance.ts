//@k-url /api/app/maintenance/{action}
/* object-type: API */
// Route: /api/app/maintenance/{action} — housekeeping for stored resource files.
import { cleanupOrphanFiles } from "code/Services/storage";
import { resolveReviewActor } from "code/Services/review";
import { errorResponse, successResponse } from "code/Utils/response";
k.api.post("clean-orphans", (body: unknown) => {
  const actor = resolveReviewActor();
  if (!actor) {
    k.response.statusCode(401);
    return errorResponse(401, "UNAUTHORIZED", "请先登录");
  }
  if (actor.isAdmin !== true) {
    k.response.statusCode(403);
    return errorResponse(403, "FORBIDDEN", "只有平台管理员可以清理存储文件");
  }
  const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const dryRun = input.dryRun === true;
  const result = cleanupOrphanFiles({
    dryRun,
    olderThanHours: 24
  });
  return successResponse(result, result.message);
});