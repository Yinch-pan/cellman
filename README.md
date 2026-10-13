# 弈间 BoardGame

开发中的异步联机桌游网站，优先实现《大创造时代》，之后考虑《神秘大地》及扩展。项目位于 `C:\Users\yinch\Documents\Codex\BoardGame`。

已可运行：账号与恢复码、公开/邀请房间、三人准备开局、地图与个人板、行动预览和提交、数据库保存、蹭魔响应、自动蹭魔、六轮流程及分项计分。当前界面和内容均标注为开发预览，尚未完成完整本体规则。

本机启动：

```powershell
.\scripts\start-local.ps1
```

随后打开 <http://127.0.0.1:5173/>；无需注册即可进入本地演示。

- [运行与验证说明](docs/operations/local.md)
- [预览验证记录与剩余范围](docs/operations/preview-validation.md)
- [已确认设计](docs/superpowers/specs/2026-10-13-boardgame-design.md)
- [开发计划](docs/superpowers/plans/2026-10-13-boardgame-implementation-plan.md)
- [官方规则来源](docs/rules/sources.json)
- [规则覆盖目录](docs/rules/coverage.json)

React / Vite / TypeScript，Fastify API，PostgreSQL 17，独立纯函数规则模块。浏览器不能直接更改权威资源；预览与提交共用规则。数据库事务结合 revision 与 commandId 防止并发覆盖和重复扣费。

未部署公网，未购买服务，未实现 AI、排位、语音或观战。
