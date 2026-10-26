# cellman

开发中的异步联机桌游网站，优先实现《大创造时代》，之后考虑《神秘大地》及扩展。项目位于 `C:\Users\yinch\Documents\Codex\BoardGame`。

现已支持 3–5 人随机选配、同屏轮流游玩和账号房间；12 个种族、17 个宫殿、18 个创新的数据与行动入口，六轮流程、待响应、自动保存和分项计分。参考 Snellman 的命令回放、资源账本与待响应设计，在现有 TypeScript 规则引擎中实现，未复制其 Perl 服务端。

当前仍是测试版：双人小地图尚未开放，复杂能力组合及完整来源案例仍需验证。

本机启动：

```powershell
.\scripts\start-local.ps1
```

随后打开 <http://127.0.0.1:5173/>。新账号需填写用户名、邮箱及至少 6 位密码，通过邮件链接确认注册后才能登录。未启用邮件服务时暂停新注册，已有账号可继续登录。邮件配置见 [邮件服务](docs/operations/email.md)。

- [本次迁移、玩法与验证范围](docs/operations/snellman-integration.md)
- [四人完整试局、修复与本地验收](docs/operations/four-player-acceptance.md)
- [运行与验证说明](docs/operations/local.md)
- [预览验证记录与剩余范围](docs/operations/preview-validation.md)
- [已确认设计](docs/superpowers/specs/2026-10-13-boardgame-design.md)
- [开发计划](docs/superpowers/plans/2026-10-13-boardgame-implementation-plan.md)
- [官方规则来源](docs/rules/sources.json)
- [规则覆盖目录](docs/rules/coverage.json)

React / Vite / TypeScript，Fastify API，PostgreSQL 17，独立纯函数规则模块。浏览器不能直接更改权威资源；预览与提交共用规则。数据库事务结合 revision 与 commandId 防止并发覆盖和重复扣费。

未部署公网，未购买服务，未实现 AI、排位、语音或观战。
