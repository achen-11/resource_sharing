//@k-url /api/app/token/{action}
/* object-type: API */
// Route: /api/app/token/create — mint a time-limited download link for a hosted artifact.
import { createDownloadToken } from "code/Services/token";
import { resolveReviewActor } from "code/Services/review";
import { errorResponse, successResponse } from "code/Utils/response";
k.api.post("create", body => {
  const actor = resolveReviewActor();
  if (!actor) {
    k.response.statusCode(401);
    return errorResponse(401, "UNAUTHORIZED", "请先登录");
  }
  const result = createDownloadToken(body, actor);
  if (!result.ok) {
    k.response.statusCode(400);
    return errorResponse(400, "TOKEN_DENIED", result.message);
  }
  return successResponse(result, "已生成下载链接");
});