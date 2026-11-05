/* object-type: CodeBlock */
// 站点长期记忆（交接用）。新会话先读这一份，再读具体源码，不要凭本文件推断代码细节。
// 注意：用户已把站点拉到本地改样式，样式与部分模板可能已变，改动前必须 read_object_text 读当前源码。

/*
==================== 1. 基本信息 ====================
siteId   7b35aeed-9e08-aa6b-1675-cf054487d5af
展示名    Kooboo资源共享平台
语言      中文（页面文案、App 名称全中文）
架构决策  无 Blueprint、无 App Plan（用户明确不要），P1 逐步构建，禁止 propose_blueprint / save_blueprint

==================== 2. 业务模型 ====================
资源四要素：
  1) 资源本体：hosted（zip/tar.gz 等，≤50MB，存 kfile）或 external（外链，无法鉴权）
  2) 基础信息：名称、简介、分类、标签、归属
  3) 使用指南 + 接入指南（Markdown，前端自己渲染）
  4) 可配置「快速安装 prompt」模板，支持 {{name}} {{version}} {{artifactUrl}} {{category}} {{owner}} 占位

归属 scope：public / private / department
版本状态：draft → pending → published / rejected；只有 published 才能上架
上架状态 ShelfStatus：listed / unlisted
  · unlisted 后目录里消失、他人下载 404
  · 恢复上架不需要重新审核，恢复的是同一个已发布版本
审核只改变状态，不做内容校验（用户明确要求）

App 内角色（定义在代码里，分配持久化在 AppUserRoles）：
  platform-admin  分类/成员/资源管理 + 审核 + 发布
  reviewer        resource.review / view / download
  member          resource.create / view / download

==================== 3. 前端结构（CSR Vue3 + hash 路由，无构建工具） ====================
入口：Page `index` + Script main.js + router.js + layout.default.js（element-plus-workspace Shell）
设计系统固定 element-plus；组件从 /element-plus.js 具名导入并在 components 本地注册
Screens：screen.login.js / screen.taxonomy.js / screen.users.js / screen.my-resources.js /
         screen.resource-edit.js / screen.review.js / screen.catalog.js / screen.catalog-detail.js / screen.stats.js
Services：service.http.js / session / auth / bootstrap / notification / permission / category / member /
          resource / review / catalog / shelf / activity / token / stats / maintenance
Utils：util.format.js / util.markdown.js / util.clipboard.js / util.download.js
样式：app.css（业务）+ app-base.css + element-plus.adapters.css

前端约定：
  · requestJson 自动加 Authorization: Bearer <sessionStorage.TOKEN>，带 credentials: same-origin
    → 下载必须 fetch + blob（util.download.js），裸 <a href> 不可靠
  · 每个 service 方法用 readData(payload, 兜底文案) 判 payload.success !== true，返回 payload.data
  · 列表接口统一返回 { items, total, page, pageSize }，service 层透传整个 page 对象
  · 路由 meta：navigationGroup 分「资源 / 治理」，permission 控可见性；/stats 归治理

==================== 4. 后端三层 ====================
API（CodeType=Api）→ Services.* CodeBlock → SQLite
API 顶部必须静态 import { x } from "./Services.xxx"，禁止 k.req.services
KScript 禁止 async/await
响应信封：successResponse(data, message?, httpStatus?) / errorResponse(httpStatus, code, message, data?)

API 路由表：
  /api/app/auth/{action}          app.auth
  /api/app/user/{action}           app.user
  /api/app/notifications/{action}  app.notifications（App Base）
  /api/app/category/{action}       app.category
  /api/app/members/{action}        app.members
  /api/app/resource/{action}       app.resource   meta/list/detail/save/version-save/upload/version-submit/delete
  /api/app/review/{action}         app.review     list/history/detail/approve/reject
  /api/app/catalog/{action}        app.catalog    list/detail
  /api/app/shelf/{action}          app.shelf      list/unlist/relist
  /api/app/activity/{action}       app.activity   list
  /api/app/token/{action}          app.token      create
  /api/app/stats/{action}          app.stats      overview
  /api/app/maintenance/{action}    app.maintenance clean-orphans
  /api/app/download                app.download    GET ?versionId= | ?path=&resourceId= | ?token=

CodeBlock：
  Services.resource / review / catalog / shelf / download / activity / storage / category / appRole / user / access
  Services.notify（业务通知封装）/ Services.token（一次性下载链接）/ Services.stats（统计）
  Services.notification（App Base 通知存储）/ Utils.response / ENV

==================== 5. 数据表 ====================
AppUsers(Id, KoobooUserId, KoobooUserName, Email, DisplayName, AvatarUrl, CreatedAt, UpdatedAt, LastSeenAt)
AppNotifications(Id, RecipientUserId, Type, Title, Message, ActionUrl, MetadataJson, ReadAt, CreatedAt)
  ↑ RecipientUserId 是 AppUsers.Id，不是 Kooboo 用户 id
AppUserRoles(Id, KoobooUserId, UserName, RoleCode, GrantedByUserName, CreatedAt, UpdatedAt)
ResourceCategories(Id, ParentId, Name, Description, SortOrder, Enabled, CreatedAt, UpdatedAt, CreatedByUserId, CreatedByUserName)
Resources(Id, Name, Summary, CategoryId, CategoryName, Scope, DepartmentId, DepartmentName,
          OwnerUserId, OwnerUserName, Tags, UsageGuide, IntegrationGuide,
          QuickInstallEnabled, QuickInstallPrompt, LatestVersionNo, LatestVersionStatus, VersionCount,
          CreatedAt, UpdatedAt, PublishedVersionNo, ShelfStatus DEFAULT 'listed', DownloadCount)
ResourceVersions(Id, ResourceId, VersionNo, Changelog, DeliveryMode, ExternalUrl, FilePath, FileName,
                 FileSize, Status, SubmittedByUserName, SubmittedAt, ReviewedByUserName, ReviewedAt,
                 ReviewComment, CreatedAt, UpdatedAt)
ResourceDownloads(Id, ResourceId, ResourceName, VersionId, VersionNo, UserId, UserName, Scope, DepartmentId, ClientIp, CreatedAt)
ResourceActivities(Id, ResourceId, ResourceName, Action, ActionLabel, FromStatus, ToStatus, ActorUserId, ActorUserName, Detail, CreatedAt)
ResourceDownloadTokens(Id=token, ResourceId, ResourceName, VersionId, VersionNo, ExpiresAt,
                       CreatedByUserId, CreatedByUserName, CreatedAt, LastUsedAt)
ResourceFiles(Id, ResourceId, FilePath UNIQUE, FileName, FileSize, UploadedByUserId, UploadedByUserName,
              State pending|used, CreatedAt, UsedAt)

==================== 6. 已定产品决策 ====================
部门资源审核 = 该部门 isManager + resource.review，平台管理员兜底
下架权限 = 审核人 + 维护人自己；恢复上架一键，不需再审
在架资源拒绝删除（必须先下架）
下载鉴权走 A 档：出口收口到 app.download + 前端 fetch blob；不处理历史 /__kb/kfile 直链（无鉴权钩子，用户已知并接受）
外链模式无法鉴权，保持直连
我的资源真分页（page/pageSize + COUNT + LIMIT/OFFSET），目录/审核台用 total + 触顶提示行

==================== 7. 踩过的坑（务必先看） ====================
1) 建 CodeBlock 的工具名是 create_codeblock（全小写 b）；create_code_block 会报 function_definition_unavailable
2) run_kscript：module 模式必须 export default；classic 模式必须 return。混用会「无输出无报错」，极易误判为成功
3) SQLite 列默认值不要写成 '''listed'''，会存进带引号的值（8 字节），导致严格 SQL 匹配 0 行
   → 读取层统一用 normalizeShelfStatus 去引号；INSERT 显式写 ShelfStatus
4) App Base Shell 通知气泡原先绑 item.body，而后端字段是 message → 正文永远空白（已修）；通知原先不可点击（已加跳转 + 标记已读）
5) k.file 没有目录列举 API：getAllFiles / getFiles / getFolders / listFiles 都不存在
   → 孤立文件清理改用 ResourceFiles 上传登记表，不做扫盘比对
6) 同一 Script 里重复 import 同一组件（如 ElPagination）会导致整页白屏 SyntaxError；
   Preflight 抓不到，read_preview_diagnostics 能抓到
7) update_text_object 批量 patch：只要一条 oldContent 不匹配，整批失败 → 先 read_object_text 再 patch
8) ElRadio/ElRadioGroup 的 label 语义跨版本不一致 → 用 ElSelect；不要用 ElButton tag="a"（改用原生 a.el-button）
9) 部门成员对象字段是 PascalCase（Id/UserName/IsManager），且要跳过全零 GUID
10) listMyResources(actor, filters) 参数顺序是 actor 在前

==================== 8. 已实测通过的行为（改动前不必重复验证） ====================
· 下架 → 目录消失 + 他人下载 404 → 恢复上架 → 目录回来，全程不需再审
· 一次性下载链接：正常解析 zip；伪造 token 404；过期 410；资源下架后同一 token 立刻 404
· 删除资源：ResourceDownloads 1 → 0，同时写一条 resource.delete 审计（资源没了审计保留，仅管理员可查）
· 通知：提交审核 → 审核人；通过 → 维护人（自己操作会跳过自通知）；正文非空、气泡可点、点击后 ReadAt 写入
· 统计页：6 张卡片真实数据；非审核人拿到空数据而非全站数字
· 清理孤立文件：过期未用的删除、新上传保留、在用文件保留、资源已删除的删除、在用文件磁盘缺失会单独报数
· 审计：上下架/删除写 ResourceActivities，读取权限 = 维护人 / 审核人 / 管理员
· Preflight PASS 67 个对象 0 findings；read_preview_diagnostics 0 error

==================== 9. 待拍板 / 待做 ====================
待拍板：
  · 新版本过审是否自动重新上架（approveVersion 目前写死 ShelfStatus='listed'）
  · 维护人换部门后，已有部门资源的归属是否自动迁移
待做：
  · 误删资源回收站
  · 下载令牌的撤销列表 UI（现在只能靠下架或等过期失效）
  · 存量历史文件没有登记，清理扫不到（缺目录列举能力）
  · 通知只有站内气泡，没有邮件/站外推送
  · 上传中途取消的孤儿文件：已由登记表 + 24h 阈值覆盖，但没有定时任务，只有统计页手动按钮

==================== 10. 当前真实数据 ====================
唯一资源：「测试」，Scope=public，分类 SKILL，PublishedVersionNo=1，ShelfStatus=listed，hosted zip
路径 resources/b8baf01a8d27459fbbbb42261c855113/1793795713217-kooboo_material_site_builder.zip
真实用户：zguoqi2（isAdmin=true，研发部 isManager=true，部门 id 0f8ee9da-2b9c-e797-9cf2-e895344c3f54）
测试残留：ResourceActivities 里保留 6 条上下架审计（真实资源上的验证动作，故意不清）

==================== 11. 怎么继续 ====================
1) 新会话先读本对象（read_object_text nameOrId=MEMORY objectType=CodeBlock），再读目标源码
2) 用户已把站点拉到本地改视觉风格：改样式前必须读当前 app.css 与对应 screen 文件，不要照本文件的旧描述写
3) 验证套路：run_kscript 探针（module 模式 export default）→ Preflight → 改完刷新 → read_preview_diagnostics(mode=issues)
4) 需要 UI 证据时用浏览器工具：navigate_iframe → observe_iframe / get_iframe_dom_tree → act_on_iframe_element
   evaluate_in_iframe 在本站返回 [undefined]，不可用，改用 get_iframe_dom_tree 读文本
*/
export const MEMORY_FORMAT = "site-handover-v1";