//@k-url /api/app/stats/{action}
/* object-type: API */
// Route: /api/app/stats/overview — usage numbers for reviewers and administrators.
import { canReadStats, readStatsOverview } from "code/Services/stats";
import { resolveReviewActor } from "code/Services/review";
import { errorResponse, successResponse } from "code/Utils/response";
k.api.post("overview", () => {
  const actor = resolveReviewActor();
  if (!actor) {
    k.response.statusCode(401);
    return errorResponse(401, "UNAUTHORIZED", "请先登录");
  }
  if (!canReadStats(actor)) {
    k.response.statusCode(403);
    return errorResponse(403, "FORBIDDEN", "只有审核人或管理员可以查看统计");
  }
  return successResponse(readStatsOverview(actor), "已加载统计");
});