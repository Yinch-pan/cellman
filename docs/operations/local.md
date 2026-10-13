# 本地运行

项目位置：`C:\Users\yinch\Documents\Codex\BoardGame`。与 `IndieGame`、`IndieGame2` 同级。

## 本机启动

在 PowerShell 中进入项目目录，然后运行：

```powershell
.\scripts\start-local.ps1
```

打开 <http://127.0.0.1:5173/>。点击“先看看游戏桌面”可进入本地演示；注册不同账号后可创建三人房间联机。开发服务器仅监听本机，尚未部署到互联网。

关闭网页与 API：

```powershell
.\scripts\stop-local.ps1
```

同时停止本项目的数据库：

```powershell
.\scripts\stop-local.ps1 -StopDatabase
```

脚本只管理 `work/service-pids.json` 中登记且路径匹配本项目的进程。若已有其他预览占用 3001 或 5173，启动会报错，不会结束未知进程。

## 环境

Node.js 24、pnpm 11、PostgreSQL 17。当前电脑已在 `work/postgres/` 准备 PostgreSQL 17.11，监听 `127.0.0.1:55432`；开发库与测试库独立。数据库登录信息只存在被 Git 忽略的 `.env` 中，不放入源代码。

在其他电脑上安装 PostgreSQL 17，分别建立开发库与测试库，复制 `.env.example` 为 `.env` 并填入真实连接信息。`work/` 和本地数据库不会随 Git 一起复制。安装依赖后，可以在两个终端分别运行 `pnpm dev` 和 `pnpm dev:web`。迁移会在 API 启动时执行。

## 验证

```powershell
node --env-file=.env node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --config apps/web/vite.config.ts
node node_modules/@playwright/test/cli.js test
node node_modules/tsx/dist/cli.mjs scripts/check-rules.ts --stage=inventory
```

浏览器测试使用已安装的 Chrome，自动在 5174/3002 启动隔离服务，不需要预先启动试玩网页。所有数据库测试必须设置 `TEST_DATABASE_URL`，且与开发库分开；测试使用随机 schema 隔离并在结束后清理。不能在真实用户数据库上运行测试。

`check:rules --stage=inventory` 只表示来源目录结构合格。`m1`、`m3` 覆盖检查在证据清单补齐前会失败；这不是已经完成本体规则的声明。

实际验证结果与剩余范围见 [预览验证记录](preview-validation.md)。

## 当前限制

当前是开发预览：三人固定配置、有限宫殿与创新组合；还需要完整种族、完整开局选择、双人地图和人数差异的验证。请勿将开发预览用于正式长期对局。神秘大地尚未实现。未进行真人规则试局，也未发布公网服务。

运行日志位于 `work/logs/`，PostgreSQL 日志位于 `work/postgres/server.log`。注册后显示一次恢复码；忘记密码通过恢复码处理，不发送邮件。
