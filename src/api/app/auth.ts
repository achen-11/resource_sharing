//@k-url /api/app/auth/{action}
import { errorResponse, successResponse } from "code/Utils/response";
type LoginInput = {
  userName: string;
  password: string;
};
function readLoginInput(body: unknown): LoginInput | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const input = body as Record<string, unknown>;
  const userName = typeof input.userName === "string" ? input.userName.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!userName || !password) {
    return null;
  }
  return {
    userName,
    password
  };
}
k.api.post("login", (body: unknown) => {
  const input = readLoginInput(body);
  if (!input) {
    return errorResponse(400, "INVALID_ARGUMENT", "请输入账号和密码");
  }
  const account = k.account.login(input.userName, input.password);
  if (!account || !k.account.isLogin) {
    return errorResponse(401, "INVALID_CREDENTIALS", "账号或密码不正确");
  }
  const currentUser = k.account.user.current;
  const userName = currentUser ? currentUser.userName : input.userName;
  return successResponse({
    userName
  });
});
k.api.get(() => k.api.notFound());