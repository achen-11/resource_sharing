# Kooboo 资源共享平台

由 `kb clone` 从 https://resource_sharing.localkooboo.com/ 克隆。

## 开发与同步

- 配置：本地 `.env`，含站点连接凭据，请勿提交或分享。
- 资源：`src/page`、`src/js`、`src/css`、`src/api`、`src/code`。
- 定向同步：`kb push src/css/cpr-theme.css` 或 `kb push src/js/layout.default.js`。
- `kb sync` 会持续监听并修改远端站点。

## CPR 风格改造（2026-11-05）

以用户提供的 CPR 截图为视觉参考，保留 Vue、Element Plus、原有路由及业务接口。

- `src/css/cpr-theme.css`：浅灰背景、白色圆角面板、表格、表单、分段标签页、响应式样式。
- `src/js/layout.default.js`：侧栏导航、底部账户和通知、移动端导航抽屉。
- 资源目录、统计与登录页面的视觉调整，以及页面说明文字精简。
- 基础信息表单采用响应式双列布局，资源目录使用可键盘访问的路由链接。
- 11 个前端文件有变动；API、CodeBlock、权限、审核、下载、上传逻辑未改。

原始受改文件备份在 `backups/before-cpr-20261105/src/`。

检查：44 个 JavaScript 模块语法解析，11 个 Vue 模板编译，5 个 CSS 文件解析，以及本地模块/样式引用检查通过。未执行浏览器验收。
