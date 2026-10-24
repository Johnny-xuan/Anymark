# AnyMark：书签文件系统 bridge

## 产品目标

将 Chrome 原生书签映射为虚拟文件系统，供本地 Agent 通过 CLI 或 MCP 操作。Popup 负责快速收藏；Web 提供直接管理。AnyMark 不内置模型、聊天、自动 Agent 工作流或第二套书签数据库。

接口采用命令／请求形式，不做 FUSE 挂载，也不做本地目录双向同步。

## 数据与文件系统

- Chrome bookmarks API 是书签结构的唯一事实源。每次操作读取当前书签，不依赖 UI store 或跨请求书签缓存；备注由本地 metadata 提供。
- `/` 是浏览器书签根。文件夹是目录；书签是包含 `title`、`url`、`note` 的 JSON 文件。读取文件不抓网页正文，也不打开 URL。
- 规范路径段为 `encodeURIComponent(title)~id`，标题中的 `~` 额外编码为 `%7E`。同名、空标题和带 `/` 的标题均可区分。
- 也接受无 ID 的标题路径；同级重名必须返回 `EAMBIGUOUS` 和候选项，不选择第一个。`id:<id>` 是当前 profile 内稳定寻址方式。
- 完整对象身份为 `profileId + bookmarkId`。规范路径随改名和移动变化；旧路径不得按同名节点回退到其他对象。
- 列表保留 Chrome 顺序。不能硬编码顶层目录 ID，不能假设每种 `folderType` 只有一个目录。
- 公共操作为 `ls`、`stat`、`cat`、`tree`、`find`、`mkdir`、`write`、`edit`、`inbox`、`capture`、`web`、`export`、`import`、`mv`、`cp`、`rm`。不是通用 shell，不解析管道或执行系统命令。
- `write` 创建或修改书签；内容只接受 `title`、`url`、`note`。不允许改身份、父节点或系统属性。新建时缺省标题取目标路径名；`exclusive: true` 拒绝更新已有目标。
- `mkdir`、移动、复制不静默覆盖或合并目标。复制目录需要显式递归；复制生成新 ID，移动保留 ID。
- `edit` 只更改明确提供的字段；纯备注编辑不调用 Chrome 属性更新。
- `rm` 永久删除书签或空目录；非空目录需要显式 `recursive`。不伪装回收站、撤回或事务回滚。
- 根、系统目录本身和 managed 节点的 Chrome 属性不可修改。本地备注可编辑；可写系统目录的子项可正常管理。
- Chrome 没有多节点事务。递归复制失败时返回已创建节点及失败信息。不能宣称全有或全无。

## 备注与 Inbox

- `chrome.storage.local` 按 bookmark ID 保存本地 note。Chrome profile 自身提供隔离；不使用 `storage.sync`，也不按标题或 URL 绑定备注。
- 书签与文件夹的 entry 均含 `note`。`cat` 提供书签内容；`stat`、`ls`、`tree` 提供文件夹备注；`find` 检索备注。
- 移动保留备注；复制把备注写到新 ID。递归删除及 Chrome 外部删除事件会清理对应 metadata。
- Chrome 修改后 metadata 失败时返回 `EPARTIAL`，附已完成的条目或 ID，不声称回滚。
- 当前 note 使用 `anymark.note.v2:` 键和 JSON 字符串值，避免 Chrome 存储损坏孤立 UTF-16 surrogate。启动时迁移旧版内部备注键：先验证并写入新值，再删除旧值，已有有效 v2 值优先。操作与外部删除清理等待迁移；损坏数据不静默变为空备注。这是备注存储格式迁移，不是 AnyMark v1 产品的聊天、模型配置或其他应用数据迁移。
- Inbox 是真实 Chrome 文件夹，只在 `capture` 时创建。保存其 ID；改名后仍关联原文件夹。创建时省略 `parentId`，由 Chrome 选择存储位置。
- 只在 Inbox 直接书签中按 `new URL(value).href` 去重，不移走其他目录的书签，不删除 query 参数。重复 capture 保留标题及未明确提供的 note。
- 读取缺失 Inbox 返回空结果，不创建目录。已删除的 Inbox 只在下次保存时重建。

## 用户界面

- Web 运行于 `web/index.html` 扩展页。Popup 图标与 `anymark web` 打开同一页面；没有额外 HTTP 服务。
- Popup 只在用户打开 action 时读取当前页 URL 和标题。仅允许 HTTP(S) capture，不注入页面脚本。
- Popup 和 Web 不受 Agent 授权开关限制。Native 请求仍需授权；所有书签操作进入同一串行队列。
- 控件图标由 `extension/icons.js` 提供；工具栏和标签页品牌 PNG 从同一书签形状生成。网站图标由 `extension/favicons.js` 读取同扩展 Origin 的 `/_favicon/`，保留完整 `pageUrl`，不访问第三方服务或猜测网站图标路径。普通页面预览没有扩展 runtime 时只显示中性占位。

## 二维关系图

- `web/graph-model.js` 先读取深度 12 的真实树，再逐个展开所有省略的目录边界；以稳定 ID 去重，恢复 Chrome 原有深度优先顺序。
- `web/graph.js` 使用 Canvas 2D 和本地打包的 d3-force。确定性 XY 初始布局按现有层级聚散；边仅表示真实父子关系，不生成语义关系。
- d3 的内部定时器立即停止。可见时手动推进有限布局，每批有时间上限，最多 140 ticks。收敛后没有持续渲染循环；隐藏时暂停，销毁时释放观察器、输入监听、图片缓存和布局引用。
- 平面视口只含平移和缩放。节点拖动只改当前视图坐标，不调用书签写接口。选中请求必须经宿主离开保护和 `stat`，由宿主调用 `select()` 接受。
- Canvas 网站图标按 URL 缓存，失败不逐帧重试；刷新裁剪未使用项，销毁取消回调。DOM 列表、详情和可访问节点结果使用同一图标来源。
- 支持方向键、分页节点结果、实时减少动态效果和深浅主题。Canvas 不可用时保留实际数据列表及返回入口，不显示伪造关系图。

## HTML 传输

- `src/transfer.js` 使用 parse5 惰性解析 Netscape bookmark HTML。输入内容不作为 DOM 执行，不加载网页或脚本。
- `export` 仅读取，完整遍历选定目录，不创建 Inbox。`import` 在任何创建前解析并验证整份文件；目标必须为已有可写目录，始终新建容器。
- `anymark-export-version=1` 启用扩展元数据。备注是 JSON 字符串的 UTF-8 base64url；Inbox 标记绑定到文件结构。编码不等于加密。
- 普通 Chrome HTML 仅恢复书签。AnyMark 文件还把备注写到新 ID，保留同名与同 URL 的独立条目；已有有效 Inbox 不替换。根备注恢复到新容器。
- 已创建后失败返回 `EPARTIAL`，包含容器与创建 ID。不自动回滚或重放。Web 的未知结果锁住立即重试，提示先核对。
- CLI 文件导出不覆盖既有文件，权限为 `0600`；Web 通过本地 Blob 下载，不申请 downloads 权限。Native 总请求限 1 MiB；Web 文件预览要求小于 64 MiB。
- esbuild 将所有浏览器入口及动态模块打包成本地 ESM，复用共享 chunks；不使用 CDN。

## 本地连接

```text
本地 Agent → CLI 或 MCP stdio adapter
                     ↓
       当前用户的私有 Unix socket（按 profile 隔离）
                     ↓
       Chrome 启动的 Native Messaging host
                     ↓
       MV3 扩展 → 书签文件系统 → chrome.bookmarks
```

- 每个已启用的 profile 产生一个轻量 Native host 与对应 socket。host 仅转发，不缓存书签，不另起全局 daemon。
- 扩展在 `storage.local` 生成并保存随机 `profileId`，不写入 `storage.sync`。扩展 ID 不是 profile ID。
- 用户在扩展中显式开启本机读写授权。关闭授权后断开连接。浏览器启动时只恢复已开启的连接；失败时用户可手动重连。
- CLI 请求必须指定 `--profile`、`ANYMARK_PROFILE` 或通过 `anymark use` 保存的默认 profile。默认目标离线时不切到其他 profile。
- 同一 profile 同时出现两个连接时拒绝占用，不静默替换。
- Native Messaging 采用长度前缀 JSON；CLI IPC 与 MCP stdio 不与其共用 stdout。
- 扩展使用 `bookmarks`、`storage`、`nativeMessaging`、`activeTab`、`favicon`。不申请 `history`、宽泛的 `tabs`／`<all_urls>` 或 `web_accessible_resources`；没有 content script 或公网服务。升级新增权限时需要在原 Profile 重新加载并按 Chrome 提示确认。
- Native host 安装支持 macOS、Linux，要求 Node.js 22+。不同 Agent 共用 CLI／MCP，不需要专属 Agent 插件。Windows 需要不同的本机 IPC 和安装机制，目前不支持。仅使用 Popup／Web 不需要连接器或 Node.js；扩展要求 Chrome 134+。

## 安全与失败

- 运行目录只允许当前用户访问；socket 只允许当前用户读写。检查原路径和 symlink 目标的祖先链，拒绝其他用户可替换的目录；允许受 sticky-bit 保护的系统临时目录。
- Native host 清单只允许固定扩展 Origin。扩展再次检查启用状态与操作白名单。
- 信任边界是当前 OS 用户。不能将 Unix 文件权限宣传为同一用户下恶意进程的隔离机制。
- 写操作由扩展串行执行；Chrome UI 和同步仍可能并发修改数据，不承诺 CAS 或跨应用事务。
- 未连接、明确操作失败、已提交后结果未知是不同状态。已提交的写操作断线或超时后不自动重放，不声称已经取消或回滚。
- 请求最多 1 MiB，响应低于 64 MiB。扩展在发送前限制响应大小；超限只影响当前请求，不关闭整个 profile。写入已完成但结果过大时返回 `ERESULTTOOLARGE`，明确要求查询现状而非重放。

## 发布包与升级

- `anymark-v2.0.0-chrome-extension.zip` 仅包含构建后的扩展。解压后在 `chrome://extensions` 加载含 `manifest.json` 的目录，即可使用 Popup／Web；默认不开启 Agent 访问。
- `anymark-v2.0.0-agent-connector-source.zip` 是可选 CLI／MCP 连接器的源码包，不是二进制安装程序。需要 Node.js 22+，在源码目录安装生产依赖并注册 Native host；不需要再次构建扩展。
- Native host 注册记录 Node 和连接器入口的绝对路径。源码目录需长期保留；移动目录或更换 Node 路径后需要重新安装注册。可选的 `npm link` 只提供全局 CLI 命令，也可直接通过 Node 运行入口。
- 完整仓库可构建 `dist/extension`，也可直接运行同一份连接器源码。安装、Profile 绑定及 MCP 配置步骤见[中文 README](../README.md#快速开始)或 [English README](../README.en.md#quick-start)。
- v1 的旧扩展目录不能替代 v2 构建目录。升级时保留 Chrome 原生书签并加载新版扩展；不承诺迁移旧版内置 AI 应用数据。内部备注键格式版本与产品版本相互独立。

## 目录边界

- `src/`：文件系统、协议、本地连接和安装逻辑。
- `bin/`：CLI 与 MCP 入口。
- `extension/`：MV3 连接、Popup 收藏、共享图标与品牌资源；`web/`：扩展全页工作台。
- `scripts/`：扩展打包与开发工具。
- `test/`：消费者可见的语义与连接边界测试。
- `docs/`：公开架构说明与 README 图示资源。

## 调研依据

- [Chrome bookmarks API](https://developer.chrome.com/docs/extensions/reference/api/bookmarks.md.txt)
- [账户与本地书签模型](https://developer.chrome.com/blog/bookmarks-sync-changes)
- [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [MV3 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle.md.txt)
- [扩展内的网站图标](https://developer.chrome.com/docs/extensions/how-to/ui/favicons)
- [MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)

