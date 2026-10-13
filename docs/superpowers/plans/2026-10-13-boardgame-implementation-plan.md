# 大创造时代联机网站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. 用户尚未选择执行方式；推荐由当前代理顺序实施。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现免费开房和加入、2 至 5 人异步游玩的《大创造时代》本体网站，电脑优先，并逐步完善手机体验。

**Architecture:** React 浏览器界面连接单个 Node.js 后端，PostgreSQL 保存账号、房间、局面及操作记录。独立的纯函数规则模块统一处理预览和正式行动，后端使用事务、局面版本和提交标识保护对局。客户端通过服务器事件通知和恢复查询获取变化，不在客户端决定最终局面。

**Tech Stack:** Node.js 24 LTS、TypeScript、pnpm 11、React、Vite、SVG 地图、Fastify 5、PostgreSQL 17、pg、Zod、Vitest、Playwright。执行时选择与 Node.js 24 兼容的稳定依赖，并将完整版本写入 `pnpm-lock.yaml`；不用预发布版本，不忽略依赖引擎限制。

**Spec:** [已确认设计](C:/Users/yinch/Documents/Codex/BoardGame/docs/superpowers/specs/2026-10-13-boardgame-design.md)。本计划的文件路径均相对于未来工程根目录 `C:/Users/yinch/Documents/Codex/BoardGame`；该目录目前仅保存设计与计划，应用代码尚未创建。

## Global Constraints

- 玩家免费创建和加入房间。
- 支持本体 2 至 5 人的多人规则，不含自动机。
- 异步对局；玩家同时在线时也可以连续操作。
- 默认不设置强制超时，不替玩家自动行动或判负。
- 提交前可修改；服务端确认后的行动首版不支持回退。
- 自动蹭魔默认关闭；玩家按每局设置，条件外等待本人选择。
- 新设置应用于尚未处理及后续产生的响应，已完成的响应不重算。
- 站内待行动列表与标记；首版不依赖邮件、短信或浏览器推送。
- 房间列表仅展示招募信息；局面和详细记录由本局玩家访问，首版不开放观战。
- 全员准备后由房主启动；启动后固定参与者，不支持中途换人或加入。
- 电脑优先，逐步完善手机操作。
- 第一版不包含排位、赛事、AI 对手、站内语音、自定义房规或其他游戏。
- 每局创建时记录规则版本及实际开局配置。
- 准确选项及结算顺序以规则核对结果为准，不根据“通常如此”推断。

## Review Focus

1. 行动已保存但响应在网络中丢失：同一提交标识重试返回原结果，不重复扣资源。任务 8 验证。
2. 手机和电脑同时确认，或旧标签页恢复：仅一个版本合法提交；另一个保留草稿并提示重新确认。任务 8、12 验证。
3. 非当前回合玩家需要蹭魔，期间修改自动条件：待行动列表包含该玩家，响应只执行一次。任务 5、13 验证。
4. 私密房间链接泄露或非参与者枚举对局编号：不能读取局面、操作日志或事件订阅；开局后不能靠邀请替换参与者。任务 10、11 验证。
5. 发布新规则或在待响应时重启：原局使用原规则版本恢复，不改变已经处理的效果。任务 8、16 验证。

---

## 交付里程碑

| 里程碑 | 任务 | 用户可检查的成果 |
| --- | --- | --- |
| M1 规则验证 | 1 至 7 | 固定开局能运行完整对局测试，清楚列出尚未支持的能力；此时不是可公开使用的网站 |
| M2 电脑联机测试版 | 8 至 13 | 多个账号能开房、行动、刷新续局和处理蹭魔，使用 M1 的受限内容 |
| M3 完整本体测试版 | 14 | 补齐本体内容与人数差异，通过完整覆盖检查和真人试局 |
| M4 发布准备 | 15 至 16 | 手机适配、恢复演练、测量结果和可部署工程 |

M4 不等于已经公开发布。正式部署地址、付费服务采购和许可条件需在执行中有具体证据与配置；当前计划不授权购买服务或联系权利方。

## 工程与环境

项目目录当前仅有设计与计划，没有应用代码或 Git 仓库。执行时在指定工程目录初始化仓库，保存设计和本计划的副本到 `docs/`；不得将整个 Documents 目录初始化为仓库。每个任务验证后提交该任务文件，保留用户已有改动。

已检测到 Node.js `v24.19.0` 及 pnpm `11.25.0`。本机包管理器入口为 `C:/Users/yinch/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.cjs`；若 `pnpm` 不在 PATH，使用 `node` 加该绝对路径执行下文命令。部署使用 Node.js 24 分支经验证的当前维护补丁。

未在 PATH 中发现 PostgreSQL、psql 或 Docker。任务 8 必须准备可连接的 PostgreSQL 17 测试实例；优先复用已有开发实例，否则在工作目录内准备本地数据库运行环境。不得用内存存储通过数据库验收，也不把缺失工具当成已安装。

### 文件职责

| 路径 | 职责 |
| --- | --- |
| `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`vitest.config.ts` | 工程脚本、依赖与测试配置 |
| `packages/rules/src/` | 无网络和数据库依赖的规则、目录、地图、状态变更 |
| `packages/rules/test/fixtures/` | 人工依据规则写出的初始局面、行动与期望结果 |
| `packages/contracts/src/` | API 请求、结果、错误与客户端视图结构 |
| `apps/server/src/auth/` | 账号、密码校验、会话与恢复码 |
| `apps/server/src/rooms/` | 房间、座位、准备和启动 |
| `apps/server/src/games/` | 预览、事务提交、读取、通知和个人对局列表 |
| `apps/server/src/db/`、`apps/server/migrations/` | 数据库连接、迁移与约束 |
| `apps/web/src/features/` | 登录、大厅、房间、桌面、待办和结果页面 |
| `tests/e2e/`、`tests/load/` | 多浏览器流程与负载验证 |
| `docs/rules/`、`docs/operations/` | 规则依据、覆盖表、部署和恢复手册 |

根脚本统一提供 `pnpm test:unit`、`pnpm test:db`、`pnpm test:e2e`、`pnpm typecheck`、`pnpm build`、`pnpm check:rules`。下面的单文件测试使用根目录 `pnpm exec vitest run <path>`；数据库测试必须读取独立的 `TEST_DATABASE_URL`，不得指向真实用户数据库。

### 跨任务接口

任务 2 在 `packages/rules/src/types.ts` 定义 `GameState`、`GameAction`、`SeatId`、`PendingChoice`、`RuleEvent`、`RuleError`、`Transition`、`RuleCase`、`RuleSet`。`GameAction` 使用带 `kind` 的判别联合，正式种类由任务 1 的规则清单形成，不接受任意资源增减指令。`RuleCase` 包含 `id/sourceRefs/before/actor/action/expectedState/expectedEvents`，期望值必须人工核对，不由被测试引擎生成。

`Transition` 为 `{ok:true,state:GameState,events:RuleEvent[]}` 或 `{ok:false,error:RuleError}`。`GameState` 至少包含 `schemaVersion/rulesVersion/revision/setup/phase/round/activeSeat/players/board/shared/pending/status`，全部可 JSON 序列化；唯一 ID 和随机开局由调用方生成并保存，规则执行过程不读取当前时间或随机数。

任务 3 至 7 共同实现 `RuleSet`：`createGame(setup:SetupConfig):GameState`、`getLegalActions(state:GameState,seat:SeatId):ActionOption[]`、`applyAction(state:GameState,seat:SeatId,action:GameAction):Transition`、`getWaitingSeats(state:GameState):SeatId[]`。`SetupConfig` 和 `ActionOption` 同在任务 2 定义。`getLegalActions` 可提供参数化选择，禁止为了枚举全部组合导致界面卡顿。

任务 8 在 `packages/contracts/src/game.ts` 定义 `UserId=string`、`CommandEnvelope={commandId:string,expectedRevision:number,action:GameAction}`、`CommandResult={commandId:string,revision:number,events:RuleEvent[],waitingSeats:SeatId[]}`。统一错误码含 `UNAUTHENTICATED/FORBIDDEN/INVALID_ACTION/REVISION_CONFLICT/COMMAND_REUSE/GAME_FINISHED/RULESET_UNAVAILABLE`。HTTP 层错误与规则内详细原因分开，不能泄露其他房间数据。

## Task 1 官方规则与可验证案例清单

**Files:** 创建 `docs/rules/sources.json`、`docs/rules/coverage.json`、`docs/rules/glossary.md`、`scripts/check-rules.ts`、`scripts/check-rules.test.ts`，并建立其所需根工程配置。

**Interfaces:** 输入为官方规则及修订；在检查器定义 `RuleRequirement{id,category,sourceRefs,caseIds,milestone}`、`SourceRef{id,url,edition,page,sha256}`、`RuleManifest{sources:SourceRef[],requirements:RuleRequirement[]}`。分类固定为 setup/map/actions/power/science/abilities/cities/rounds/scoring/playerCounts。

- [ ] 获取完整官方规则及修订到项目外的 `work/rules-sources/`，记录来源、页码、版本和文件校验值；阅读包括附录与双人差异。规则下载失败时先解决资料获取，不编造规则继续。
- [ ] 人工拆出每个基础动作、组件效果、触发顺序及人数差异；为首个受限版本选择能完成全部阶段的官方组合，列入 `docs/rules/m1-content.json`。英文和中文术语一一对应。
- [ ] 写检查器失败案例：`expect(checkRules(missingSource).errors).toContain('MISSING_SOURCE')`；`expect(checkRules(missingCategory).errors).toContain('MISSING_CATEGORY')`；测试输入在同文件定义为有效清单的单字段变体。
- [ ] 运行 `pnpm exec vitest run scripts/check-rules.test.ts`，确认因缺少检查行为失败。
- [ ] 实现 `checkRules(manifest:RuleManifest):{errors:string[]}`，验证引用可定位、ID 唯一、需求有案例归属；按 M1/M3 阶段检查覆盖。准备后续任务所用案例的人工期望值及来源，不能把“有测试文件”当成规则正确。
- [ ] 运行该测试及 `pnpm check:rules -- --stage=inventory`，预期退出码 0、所有分类有依据；提交 `docs: establish sourced rule inventory`。

本任务只对本体建清单。官方已发布扩展不自动加入。尚未实际阅读规则书，因此本计划不声称已知道所有能力的执行细节；本任务是后续规则实现的必要输入。

## Task 2 可序列化局面与地图

**Files:** 创建 `packages/rules/src/types.ts`、`map.ts`、`state.ts`、`catalog.ts`、`packages/rules/test/state.test.ts`、`map.test.ts` 及对应 fixtures。

**Interfaces:** 输入任务 1 清单；输出上述共享类型、`HexId=string`、`BoardMap{hexes:Record<HexId,HexDefinition>,neighbors:Record<HexId,HexId[]>}`、`validateState(state:GameState):string[]`、`adjacent(map:BoardMap,a:HexId,b:HexId):boolean`、`createGame(setup:SetupConfig):GameState`。`HexDefinition` 在 types.ts 定义地形与展示坐标；SVG 坐标不参与相邻判断。

- [ ] 根据官方地图与开局制作 fixture，写 `expect(JSON.parse(JSON.stringify(state))).toEqual(state)`、`expect(validateState(negativeResourceState)).toContain('NEGATIVE_RESOURCE')`、固定三对相邻及不相邻格子的断言。
- [ ] 运行 `pnpm exec vitest run packages/rules/test/state.test.ts packages/rules/test/map.test.ts`，确认预期失败。
- [ ] 实现字段校验、资源整数约束、地图目录及初始局面；开局配置保存实际抽取结果和规则版本，玩家数只接受 2、3、4、5。
- [ ] 重跑测试、`pnpm typecheck`；预期通过，且 fixture 对照原地图无错位。提交 `feat: model game state and map`。

## Task 3 地形建筑与资源动作

**Files:** 创建 `packages/rules/src/actions/build.ts`、`terraform.ts`、`upgrade.ts`、`convert.ts`、`packages/rules/src/engine.ts`、`packages/rules/test/actions.test.ts`。

**Interfaces:** 消费任务 2 的类型与地图；实现 `getLegalActions`、`applyAction` 的上述动作，返回同一 `Transition`。每个处理器签名为 `(state:GameState,seat:SeatId,action:对应联合成员)=>Transition`。

- [ ] 用任务 1 的案例写 `expect(applyAction(c.before,c.actor,c.action)).toEqual({ok:true,state:c.expectedState,events:c.expectedEvents})`；另建资源不足、不可达、占用格、非法升级和非本人行动案例，断言失败且输入局面完全不变。
- [ ] 运行 `pnpm exec vitest run packages/rules/test/actions.test.ts`，确认失败。
- [ ] 按案例来源实现花费、可达、建造限制和资源转换；多步骤动作须整体合法后生效，不允许部分扣资源后报错。
- [ ] 重跑测试并检查原始状态未被修改；提交 `feat: apply terrain and building actions`。

## Task 4 魔力循环与学科动作

**Files:** 创建 `packages/rules/src/actions/power.ts`、`science.ts`、`books.ts`、`packages/rules/test/power.test.ts`、`science.test.ts`。

**Interfaces:** 消费任务 3 引擎；为 `GameAction` 中对应动作添加处理器，通过既有 `applyAction` 导出，公共动作占用保存在 `state.shared`。

- [ ] 写人工案例断言，包含满空魔力碗、支付不足、学科边界、公共行动被占用及书籍颜色不足；对不合法动作断言 `{ok:false}` 且原状态不变。
- [ ] 运行 `pnpm exec vitest run packages/rules/test/power.test.ts packages/rules/test/science.test.ts`，确认失败。
- [ ] 实现规则表中精确的数量、代价和限制，禁止由界面提交最终资源；本轮公共行动只能按规则使用。
- [ ] 重跑该组测试，验证每种案例的资源守恒或有来源的生成消耗记录；提交 `feat: implement power and science actions`。

## Task 5 回合顺序与响应队列

**Files:** 创建 `packages/rules/src/turns.ts`、`responses.ts`、`packages/rules/test/responses.test.ts`。

**Interfaces:** 实现 `getWaitingSeats(state)`；`PendingChoice` 包含 `id/seat/kind/options/continuation`，`continuation` 为可序列化数据。响应行动携带选择 ID，不能依赖闭包恢复。

- [ ] 写 `expect(getWaitingSeats(leechCase.before)).toEqual([leechCase.actor])`，此案例设置唯一待响应者且必须不同于当前回合玩家；另测错人、过期选择、多个相邻玩家和响应后继续原动作。
- [ ] 运行 `pnpm exec vitest run packages/rules/test/responses.test.ts`，确认失败。
- [ ] 按官方时序创建和消费响应队列；依赖未完成响应的后续行动必须拒绝。每个合法响应只消费一次，记录实际魔力和扣分。
- [ ] JSON 序列化待响应状态，再恢复和继续，断言与不中断结果完全相同；重跑测试，提交 `feat: persist turn response state`。

## Task 6 能力触发与城市

**Files:** 创建 `packages/rules/src/effects/resolve.ts`、`effects/types.ts`、`actions/city.ts`、`abilities/registry.ts`、`packages/rules/test/effects.test.ts`、`city.test.ts`。

**Interfaces:** `effects/types.ts` 定义由资源变化、计分、玩家选择与游戏内触发组成的 `RuleEffect` 判别联合；`resolveEffects(state:GameState,effects:RuleEffect[]):Transition`、`AbilityDefinition{id,sourceRefs,hooks}` 消费任务 5 响应机制。不建立跨游戏脚本语言，任务 1 清单决定本游戏必需的效果类型。

- [ ] 对 M1 每个能力写来源案例；验证建筑触发能力、能力再触发选择、城市资格刚好达标与不足、同一组件不能重复领取等实际规则边界。
- [ ] 运行 `pnpm exec vitest run packages/rules/test/effects.test.ts packages/rules/test/city.test.ts`，确认失败。
- [ ] 实现 M1 必需能力与城市规则；效果顺序由来源案例约束。目录中尚未实现的能力不得在受限开局里出现，不用空处理器冒充支持。
- [ ] 重跑测试，确认连续效果不会跳过玩家选择；提交 `feat: resolve abilities and cities`。

## Task 7 收入轮次终局与完整引擎试局

**Files:** 创建 `packages/rules/src/setup.ts`、`rounds.ts`、`scoring.ts`、`versions.ts`、`packages/rules/test/full-game.test.ts`、`scoring.test.ts`、`fixtures/m1-full-game.json`。

**Interfaces:** 完成 `RuleSet`，导出 `loadRuleSet(version:string):RuleSet`；计分明细为 `ScoreBreakdown{seat,items:{reason,points,sourceRefs}[],total}`。终局状态禁止新动作。

- [ ] 依据规则清单建立 M1 全局行动序列；断言每步合法，终局状态为 `finished`，最终资源和每项分数等于人工核对 fixture。另测末位玩家结束轮次、收入只发一次、并列及双人计分差异。
- [ ] 运行 `pnpm exec vitest run packages/rules/test/full-game.test.ts packages/rules/test/scoring.test.ts`，确认失败。
- [ ] 实现准备选择、轮次转换、公共行动重置、收入及最终结算，固定已启动对局的规则版本；未知版本明确报错，不能用最新规则替代。
- [ ] 运行规则全套测试和 `pnpm check:rules -- --stage=m1`；预期退出码 0，生成 `docs/rules/m1-validation.md`，列出受限内容及明确未覆盖项。提交 `feat: complete first rules-only game`。

## Task 8 PostgreSQL 与幂等提交

**Files:** 创建 `apps/server/src/db/pool.ts`、`migrate.ts`、`apps/server/migrations/001-games.sql`、`apps/server/src/games/repository.ts`、`commands.ts`、`packages/contracts/src/game.ts`、`apps/server/test/commands.db.test.ts`。

**Interfaces:** `submitCommand(actor:UserId,gameId:string,command:CommandEnvelope):Promise<CommandResult>`；服务内部显式注入数据库和 `loadRuleSet`。表包括 games、game_members、game_commands、game_events，所有查询使用参数绑定。

- [ ] 准备独立 PostgreSQL 17 测试库和连接配置；迁移脚本只作用于明确数据库，测试通过唯一 schema 隔离数据。
- [ ] 写并发测试：同一行动发送两次只增长一次 revision、只有一份事件；同 ID 不同 payload 返回 `COMMAND_REUSE`；两个不同 ID 同 revision 仅一个成功；事务中故障后状态和日志都不变。
- [ ] 运行 `pnpm exec vitest run apps/server/test/commands.db.test.ts`，确认因行为未实现失败，而非数据库无法连接。
- [ ] 按固定锁顺序锁定对局行，先校验成员再检查提交记录、版本及规则；保存局面、事件和命令结果于同一事务。命令唯一键包含 gameId、actorId、commandId；读取幂等结果时核对 payload 摘要。
- [ ] 在提交后、返回前模拟断连，重新连接重试并读取原结果；重启后读取待响应局面，断言规则版本和数据相同。
- [ ] 运行 `pnpm test:db`，预期以上真实数据库测试通过；提交 `feat: persist idempotent game commands`。

## Task 9 账号与会话

**Files:** 创建 `apps/server/migrations/002-accounts.sql`、`apps/server/src/auth/password.ts`、`sessions.ts`、`routes.ts`、`apps/server/test/auth.db.test.ts`、`apps/server/src/app.ts`。

**Interfaces:** `register(input:{username:string,password:string}):Promise<{userId:UserId,recoveryCode:string}>`、`authenticateSession(token:string):Promise<UserId|null>`。用户名为不区分大小写的 3 至 24 位字母数字下划线，中文展示昵称单独保存；密码 12 至 128 个 Unicode 字符，不截断。

- [ ] 写注册、重复用户名、错误密码、注销、过期会话及一次性恢复码测试；断言退出后的旧 cookie 无效，恢复密码使全部旧会话失效。
- [ ] 运行 `pnpm exec vitest run apps/server/test/auth.db.test.ts`，确认失败。
- [ ] 用 Node.js scrypt 的独立随机盐保存密码派生值，采用恒定时间比较；会话与恢复码使用密码学随机值，只在数据库保存 token 摘要。恢复码注册时只显示一次，用户自行保存，首版不接邮件。
- [ ] Cookie 设置 HttpOnly、SameSite=Lax，生产环境 Secure；写接口校验 Origin 和 CSRF token。会话绝对有效期 30 天；登录、注册及恢复接口限速，日志不记录密码、cookie 或恢复码。
- [ ] 重跑测试，补验 session 固定攻击及失败信息不暴露账号存在性；提交 `feat: add account sessions`。

## Task 10 房间与准备开局

**Files:** 创建 `apps/server/migrations/003-rooms.sql`、`apps/server/src/rooms/service.ts`、`routes.ts`、`apps/server/test/rooms.db.test.ts`、`packages/contracts/src/room.ts`。

**Interfaces:** 在 contracts/room.ts 定义 `RoomView{id,visibility,capacity,hostId,status,seats,gameId}`，其中 seats 为 `{seatId,userId,displayName,ready}[]`。服务提供 `createRoom(actor:UserId,input:{visibility:'public'|'private',seats:2|3|4|5}):Promise<RoomView>`、`joinRoom(actor:UserId,roomId:string,inviteToken?:string):Promise<RoomView>`、`setReady(actor:UserId,roomId:string,ready:boolean):Promise<RoomView>`、`startRoom(actor:UserId,roomId:string):Promise<{gameId:string}>`。邀请明文仅通过房主专用响应返回。

- [ ] 写两个账号抢最后座位、非房主启动、未全员准备、私密链接无效及开局后加入测试；`expect(startCount).toBe(1)` 验证重复启动只创建一局。
- [ ] 运行 `pnpm exec vitest run apps/server/test/rooms.db.test.ts`，确认失败。
- [ ] 实现座位唯一约束、房间行锁及事务启动，真实玩家座位映射到 `game_members`；私密邀请使用随机 32 字节 token，并在数据库保存摘要。
- [ ] 开局前允许离座；房主离开时转移给最早入座者，空房间关闭；开局后保持成员固定。公开列表不返回私密房间或邀请 token。
- [ ] 重跑测试并验证并发退出与启动不会产生缺席座位；提交 `feat: create and start game rooms`。

## Task 11 API 读取预览与更新通知

**Files:** 创建 `apps/server/src/games/routes.ts`、`views.ts`、`events.ts`、`apps/server/test/game-api.db.test.ts`、`packages/contracts/src/api.ts`。

**Interfaces:** contracts/api.ts 定义 `BoardView{hexes,buildings,bridges}` 及包含 `board/players/shared/phase/round/revision/waitingSeats/choices/scoreBreakdown` 的 `GameView`。`GET /api/games/:id` 返回该参与者视图；`POST /api/games/:id/preview` 接收版本和行动；`POST /api/games/:id/commands` 调用任务 8；`GET /api/games/:id/events` 提供 SSE，仅推送 gameId 与 revision。预览返回 `costs/effects/pendingChoices/baseRevision`，不写数据库。

- [ ] 写非成员访问局面、历史和 SSE 均失败的测试；预览前后 revision 与命令计数相同；隐藏信息、会话摘要和未来随机数据不出现在返回值。
- [ ] 运行 `pnpm exec vitest run apps/server/test/game-api.db.test.ts`，确认失败。
- [ ] 使用同一个规则模块做预览和提交，投影视图只包含规则允许本玩家知道的信息；事务提交成功后发送通知。历史以 revision 分页，限制单次数量。
- [ ] SSE 断开重连或页面重新可见时客户端主动获取最新状态；连接中也每 30 秒校验 revision，补偿通知丢失。无在线浏览器不轮询对局。订阅会话过期或注销后关闭连接。
- [ ] 重跑测试，模拟通知丢失后读取最新状态；提交 `feat: expose game preview and updates`。

## Task 12 电脑端完整操作流程

**Files:** 创建 `apps/web/src/app.tsx`、`api/client.ts`、`features/auth/AuthPage.tsx`、`features/lobby/LobbyPage.tsx`、`features/room/RoomPage.tsx`、`features/game/GamePage.tsx`、`MapBoard.tsx`、`ActionPanel.tsx`、`ChoicePanel.tsx`、`HistoryPanel.tsx`、`ResultPanel.tsx`、`styles.css`、`tests/e2e/desktop.spec.ts`。

**Interfaces:** UI 使用任务 11 视图与动作结构；草稿为 `{baseRevision,action}`，不会更新权威资源。`MapBoard` 消费 BoardView 并发出选格事件；其他面板只负责自己的输入或展示。

- [ ] 写两个独立浏览器账号注册、建房、加入、准备、启动、预览、提交及刷新续局流程；断言预览不改变资源，提交后其他玩家可见新 revision。
- [ ] 运行 `pnpm exec playwright test tests/e2e/desktop.spec.ts`，确认因流程未实现失败。
- [ ] 用 Vite 建立 React 界面，地图使用自制 SVG 格子和建筑符号，桌面 1366×768 下保持地图、个人资源和行动入口可用；控件提供中文标签，颜色以文字或图形辅助辨认。
- [ ] 实现所有 M1 动作和中途选择，结果页展示分项得分；对过期草稿保留原选择并提示重新预览。网络超时使用同一个 commandId 查询或重试，不能换 ID 盲目再提交。
- [ ] 运行桌面测试并实际检查布局，验证键盘焦点、缩放、长用户名及长记录；提交 `feat: add playable desktop interface`。

## Task 13 自动蹭魔与个人对局列表

**Files:** 创建 `packages/rules/src/auto-leech.ts`、`apps/server/migrations/004-preferences.sql`、`apps/server/src/games/preferences.ts`、`inbox.ts`、`apps/web/src/features/game/LeechSettings.tsx`、`features/inbox/InboxPage.tsx`、`packages/rules/test/auto-leech.test.ts`、`apps/server/test/preferences.db.test.ts`。

**Interfaces:** `LeechPolicy={enabled:boolean,maxVpCost:number}`；`selectAutoLeech(state:GameState,choice:PendingChoice,policy:LeechPolicy):GameAction|null`。阈值接受 0 至 999 的整数，此范围是输入校验而非游戏合法代价；不能替玩家拒绝超阈值机会。`GET /api/me/games` 返回 needAction/waiting/finished 分类。

- [ ] 写扣 0 分、刚好等于阈值、超过阈值、关闭自动处理及多种可行选项不唯一的案例，断言后两者返回 null；验证默认关闭。
- [ ] 运行 `pnpm exec vitest run packages/rules/test/auto-leech.test.ts apps/server/test/preferences.db.test.ts`，确认失败。
- [ ] 自动响应走同一 `applyAction`，实际可接受量和代价以最终局面计算。更新设置也是带幂等 ID 的事务操作，锁定对局后重算尚未处理响应；人工响应同时到达也只能消费一次。
- [ ] 保存设置变更、自动响应原因与结果；待行动列表使用 `getWaitingSeats`，包含非当前回合响应者；隐藏对局仅写个人偏好，不更改对局和其他人的列表。
- [ ] 重跑测试，补验服务器重启后仍保留设置，已处理响应不因调整设置重算；提交 `feat: automate eligible leech responses`。

## Task 14 完整本体覆盖与玩家试局

**Files:** 扩充 `packages/rules/src/abilities/` 与 `catalog.ts`；创建 `packages/rules/test/abilities/`、`player-counts.test.ts`、`tests/e2e/full-game.spec.ts`、`docs/rules/m3-validation.md`，更新 `docs/rules/coverage.json`。

**Interfaces:** 保持 `RuleSet` 和 API 合约；所有能力经既有注册表、效果系统及选择面板表达，新增选择类型同时更新其 UI 与序列化测试。

- [ ] 按任务 1 清单将遗漏内容分为种族、宫殿、创新、能力板块、公共行动与奖励、人数差异六组；每组分别执行以下测试与提交循环，不把所有能力塞进一次不可审查的提交。
- [ ] 对当前组每个条目写至少一个正常来源案例及一个相关限制或触发顺序案例，使用 `expect(applyAction(c.before,c.actor,c.action)).toEqual({ok:true,state:c.expectedState,events:c.expectedEvents})`；非法案例断言具体错误码，期望结果不能调用引擎生成。
- [ ] 运行 `pnpm exec vitest run packages/rules/test/abilities`，确认新条目失败；实现本组能力并补足对应选择 UI，再运行同组测试直至通过，提交 `feat: cover <具体组名>`。
- [ ] 对 2、3、4、5 人分别运行完整开局到终局脚本，核对地图、组件供应、人数规则和人工最终得分；运行 `pnpm check:rules -- --stage=m3`，遗漏、禁用条目或缺少来源案例均使检查失败。
- [ ] 运行 `pnpm test:unit`、`pnpm test:db`、`pnpm test:e2e`、`pnpm typecheck`、`pnpm build`，预期全部通过。
- [ ] 邀请任务由用户组织的熟悉游戏玩家试局，不代替用户联系他人；记录完整对局编号、参与人数、规则争议与处理结果。未进行真人试局时如实标为待外部验证，不宣称本里程碑已全部完成。

## Task 15 手机布局与操作恢复

**Files:** 修改 `apps/web/src/features/game/GamePage.tsx`、`MapBoard.tsx`、`styles.css`；创建 `tests/e2e/mobile.spec.ts`。

**Interfaces:** 沿用现有状态和动作 API，不另建手机专用规则。地图、个人板、公共板与日志切换只改变展示状态。

- [ ] 写 390×844 和 768×1024 视口测试，覆盖选格、资源查看、预览、确认、蹭魔选择、设置和切回页面；提交按钮不能被面板遮挡。
- [ ] 运行 `pnpm exec playwright test tests/e2e/mobile.spec.ts`，确认布局或操作测试失败。
- [ ] 实现面板切换、触屏缩放与明确选格反馈，点击目标至少 44 CSS 像素；横竖屏变化保留草稿，版本变化仍要求重新确认。
- [ ] 重跑手机及桌面回归，手工检查地图手势和软键盘遮挡；提交 `feat: support mobile game controls`。记录电脑可玩版本与手机完善版本的不同验收状态。

## Task 16 运行恢复版本与发布准备

**Files:** 创建 `apps/server/Dockerfile`、`compose.yaml`、`.env.example`、`scripts/backup.ps1`、`scripts/restore-test.ps1`、`tests/load/commands.ts`、`tests/e2e/recovery.spec.ts`、`docs/operations/runbook.md`、`capacity-report.md`、`release-checklist.md`。

**Interfaces:** 单个应用提供静态前端、HTTP API 和 SSE，数据库独立持久化；健康检查区分应用存活与数据库就绪。备份和恢复脚本接收显式数据库 URL 与文件路径，不输出连接密码。

- [ ] 写恢复测试：在待响应局面备份，恢复到隔离测试库，断言游戏状态、规则版本、成员、自动设置和事件数一致；启动缺少旧规则版本的程序必须明确拒绝处理该旧局。
- [ ] 运行 `pnpm exec playwright test tests/e2e/recovery.spec.ts`，确认测试能暴露缺失恢复能力；恢复脚本禁止覆盖非测试数据库。
- [ ] 打包应用、迁移及所需规则版本，关闭测试登录和 fixture 接口；设置 HTTPS 同源部署、数据库备份、结构化错误日志和可执行恢复步骤。状态迁移失败不继续启动写服务。
- [ ] 使用自建测试账号模拟 100 个在线客户端、20 个活跃对局，每个活跃局每 30 秒提交一条合法行动，持续 15 分钟；另测 20 个不同对局同时提交。只在本地或明确授权测试环境执行，不向第三方网站发压测流量。
- [ ] 记录测试硬件、数据库、历史数据规模、p50/p95、错误率与内存。建议首轮验收目标为测试环境 p95 小于 1 秒、意外错误率小于 1%；所有场景不得重复执行或丢失已确认行动。目标是检验条件，不是未经测量的容量承诺。
- [ ] 执行全套相关检查和备份恢复演练，输出成本估算所需实测数据；在发布清单记录目标域名、运维承担者及数字改编与素材许可状态。许可未核实不在报告中写“已获授权”，也不自动购买资源或公开发布。
- [ ] 提交 `chore: prepare deployment and recovery`；打包工程及启动说明，区分已验证、需要真人试局和等待部署条件的项目。

## 执行与审查

每个代码任务先运行新测试证明其能够发现缺失行为，再实现并验证。规则、并发和恢复测试必须使用独立期望结果；普通文案或样式微调不编写与实现同义的测试。每次只提交当前任务文件，不夹带凭据、源 PDF 或无关修改。

任务 1 至 7 构成首先执行的里程碑。完成后交付可运行的规则验证和明确覆盖清单，随后按依赖顺序推进，不能因为受限原型能跑就跳过本体补齐。阶段性反馈不意味着新增审批步骤；已授权执行后持续推进，只有规则证据、真实环境或外部试局确实缺失时指出具体依赖。

推荐在当前会话顺序实施，因为规则、异步响应与事务处理紧密依赖共同接口。也可以采用逐任务子代理实施与独立审查，但会增加上下文和审查成本。执行方式由用户选择；计划批准前不编写产品代码、不安装产品依赖。

## 设计覆盖检查

| 设计要求 | 对应任务 |
| --- | --- |
| 免费账号、公开及私密房间、准备开局 | 9、10、12 |
| 规则、开局、人数差异及完整计分 | 1 至 7、14 |
| 异步响应、自动蹭魔、站内待办 | 5、11、13 |
| 保存、重连、重复提交、双端冲突 | 8、11、12、16 |
| 历史、结果、提交前预览 | 7、8、11、12 |
| 电脑与手机 | 12、15 |
| 规则版本、真人试局、备份和容量 | 1、7、8、14、16 |
| 素材和公开发布条件 | 12 使用自制图形；16 记录发布条件 |

## 技术依据

- [Node.js 发布及 LTS 状态](https://nodejs.org/en/about/previous-releases)：选择 Node.js 24 LTS 分支。
- [Vite 环境要求](https://vite.dev/guide/)：执行时校验 Node.js 与依赖引擎要求。
- [Fastify 维护政策及兼容表](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md)：使用受维护的 Fastify 5，运行实际兼容性检查。
- [PostgreSQL 版本支持政策](https://www.postgresql.org/support/versioning/)：PostgreSQL 17 仍受支持，采用其维护补丁。
- [PostgreSQL 行锁](https://www.postgresql.org/docs/17/explicit-locking.html)：对局事务以行锁协调并发。
- [官方游戏与规则修订入口](https://www.feuerland-spiele.de/spiele/age-of-innovation/)：任务 1 的规则核对入口。

计划整理于 2026 年 10 月 13 日。以上检查命令、测试和里程碑是待执行事项，当前尚未构建应用或运行产品测试。

