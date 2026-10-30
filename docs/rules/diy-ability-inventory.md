# DIY 前置盘点：现有能力与执行边界

日期：2026-10-26。代码基线：`511f6a395a2cccf5e56685ee5db3ab62c08545e3`；规则版本：`aoi-1.1+2024-09.engine-6`。

这份表回答三个问题：当前能力究竟由什么触发、哪些步骤可以复用、哪些行为还需要专门的规则代码。它是现有实现的盘点，不是新功能已实现的声明，也不是重新认定官方规则。配套的 [首版配置格式建议](diy-ability-v1-proposal.md) 属于待实现方案。

## 1. 范围、读法与证据

主体覆盖 **76 个内容定义**：12 种族、7 家园地形、17 宫殿（含保留项 SH-X1）、10 奖励板、12 能力板、18 革新。一个定义有多个不同触发时机时拆成多行。附录另列 7 城市板、12 轮次板、4 第六轮附加计分、6 公共魔力行动和 6 书籍行动，作为能力复用时的规则环境。

以稳定 ID 为主键；显示编号来自当前 [tile-codes.ts][codes]。`BON-P*`、`INN*`、`TW*` 保留项目编号含义；不能把旧测试名称里的 BON 数字直接当成现行编号。`school` 在界面中称学院，`university` 为大学；本表保留英文 ID 避免术语混淆。科学数组顺序是银行学、法学、工程学、医学。

建议等级只描述未来改造难度，不表示现在已经可配置：

| 标记 | 首版建议 | 含义 |
|---|---|---|
| A | 首版候选 | 固定资源、书籍/科学选择、有限条件和计数，可纳入受限配置解释器；仍需实现注册与执行 |
| B | 封装后开放 | 已有处理函数，但伴随地图校验、选择队列、库存或连锁结算；先提供经过测试的固定操作，不能任意拼接 |
| C | 暂留专用代码 | 改变开局编排、空间连接、合法性、行动预算或复杂结算顺序；首版不向普通用户开放 |

表内“无”表示该能力没有额外资源成本，不免除触发它的建造、研发等原行动费用。测试证据集中在第 10 节；代码依据列指向实际执行文件，不仅是描述文本。

## 2. 所有能力共同依赖的规则

| 编号 | 必须保留的当前行为 | 依据 |
|---|---|---|
| G1 阶段与行动 | 普通特殊行动占一个主要行动；只能在自己的行动回合且主要行动未用时发动。有待选项时先响应；当前版本允许符合条件的本人在待选期间转换/燃烧。灵能者和河流建城另见专用规则。 | [engine][engine]、[special][special] |
| G2 使用次数 | `usedSpecials` 按完整来源 ID 记录，进入下一轮清空。鼹鼠建桥不记此限制；附属建筑消耗库存；二者仍受主要行动限制。失去奖励板后其能力不再可用。 | [special][special]、[rounds][rounds] |
| G3 资源语义 | “获得魔力”调用 `gainPower` 移动现有标记，受盘位容量限制；“增加魔力标记”是另一操作。学者总供应量为 7，扣除已派驻槽位。得分通过 `awardPoints` 留来源。 | [power][power]、[internal][internal]、[score-events][score-events] |
| G4 科学 | 上限 12；跨入 8 需可用钥匙并可产生使用/拒绝选择；无钥匙停 7；12 已被其他人占据则停 11。跨 3/5/7/12 获魔力；行动阶段按实际推进触发轮次分；收入阶段新跨 9 立即补该轨收入。 | [science][science] |
| G5 获得能力板 | 市场必须有库存且本人未持有。按当前格的颜色推进 `3-row` 科学、获得 `row` 本同色书；哲学家另加同色书。颜色与行由本局市场位置决定，不是能力 ID 的固定属性。每格初始 4 份。 | [catalog][catalog]、[competency][competency] |
| G6 宫殿激活 | 轮抽选中的 `draftPalace` 仅是预约；升级完成写入 `p.palace` 后才获得收入/主动/被动能力。建造一般付 4 工具、6 金币；仍需合法升级路径及宫殿库存。 | [build][build]、[special][special] |
| G7 革新取得 | 需公共池可用、个人最多 3 块；通常第 1/2/3 块付 5/6/7 本书，且满足本局颜色最低要求；荒地第二块付 5 本。未建宫殿另付 5 金币。取得会触发本轮革新分。 | [public][public] |
| G8 免费铲与建造 | 获铲不等于实际用铲，也不等于免费工坊。普通工坊仍付 1 工具、2 金币，检查空地、家园、可达性和库存；免费工坊使用独立响应。部分铲可补购，轮末科学奖励不可补购或建造。 | [build][build]、[engine][engine]、[rounds][rounds] |
| G9 建筑与中立 | `ownBuildings` 包含己方中立建筑。基础建筑收入/普通建筑库存排除中立；一些计分、邻接、建城和建筑种类统计包含中立。不能把“己方建筑”统一改成排除中立。建筑变化还可能引发对手蹭魔和建城。 | [internal][internal]、[income][income]、[effects][effects]、[city][city] |
| G10 收入与结束本轮 | 收入包括第一轮；个人 `pass` 奖励第六轮也执行，且在换奖励板前计算。所有人 pass 后才结算轮末科学奖励，后者仅第 1–5 轮；第六轮处理完待选后终局。 | [rounds][rounds] |
| G11 持久化选择 | 多本自由书拆成独立选择；存在 `dependsOn`、`batch`、钥匙优先和中立放置优先。响应需检查所有权、选项和当时局面；不能仅信任最初显示的候选列表。 | [responses][responses]、[engine][engine] |
| G12 版本与回放 | 按 `rulesVersion` 分派现行/冻结引擎；回放从初始状态重新执行命令。当前无 DIY 内容快照。新配置解释器和事件顺序也必须版本化。 | [state][state]、[engine][engine]、[replay][replay] |

## 3. 种族（12）

### 3.1 起始数值

共同触发：开局所选组合确定后初始化；条件：选中该种族；成本：无；次数：一次；交互：无。四轨加值与家园加值叠加，并结算初始跨科学阈值的魔力。基础为 15 金币、3 工具、20 分；地形另见第 4 节。全部属于 A，依据 [content][content]、[state][state]。

| 种族稳定 ID | 科学加值 [银,法,工,医] | 额外工具 | 其他开局流程 |
|---|---|---|---|
| `blessed` 天佑者 | [1,1,1,1] | 0 | 无 |
| `felines` 猫人 | [1,0,0,1] | 0 | 无 |
| `goblins` 哥布林 | [1,0,1,0] | 1 | 无 |
| `illusionists` 幻术师 | [0,0,0,2] | 0 | 无 |
| `inventors` 发明家 | [0,0,0,0] | 0 | 放置后能力板 |
| `lizards` 蜥蜴人 | [0,0,0,0] | 0 | 两次自由科学 |
| `moles` 鼹鼠 | [0,0,2,0] | 0 | 无 |
| `monks` 僧侣 | [0,1,0,0] | 0 | 改变起始建筑及顺序 |
| `navigators` 航海家 | [0,3,0,0] | 0 | 无 |
| `omar` 奥尔马 | [1,0,1,0] | 0 | 增加中立灯塔及自选建筑顺序 |
| `philosophers` 哲学家 | [2,0,0,0] | 0 | 无 |
| `psychics` 通灵者 | [1,0,0,1] | 1 | 无 |

### 3.2 区别能力

| 内容/能力 | 触发时机与条件 | 成本 | 实际效果 | 次数限制 | 交互选择 | 特殊规则/建议 | 代码依据 |
|---|---|---|---|---|---|---|---|
| `blessed` 轮末科学 | 第 1–5 轮全员 pass 后的科学奖励计算 | 无 | 指定轨计算奖励时虚增 3 级 | 每次轮末一次 | 奖励若为书/铲则进入待选 | 不改变实际等级、9级收入或终局排名；B：专用计算修正 | [rounds][rounds] `roundBonus` |
| `felines` 城市奖励 | 成功领取任意城市板 | 无 | 3 次任选科学各 +1，并产生 1 本任选书 | 每次领取 | 科学轨、书色及可能的钥匙 | SH11 直接领城市板也触发；不是“形成城市群”事件；不强制先选完科学再选书，仍遵守G11；A | [city][city] `takeCity` |
| `goblins` 用铲返币 | 普通/免费改造，或中立建筑改造，实际消耗铲数时 | 原改造费用 | 每实际用铲 +2 金币 | 每把，无每轮上限 | 随原行动选地块/地形 | 未使用的赠铲不返币；补购的铲也计；A，需统一两个调用路径 | [build][build]、[neutral][neutral] |
| `illusionists` 折扣 | 执行公共魔力行动时 | 该行动魔力价减 1 | 降低本次支付 | 每次该类行动 | 原公共行动选项 | 不影响燃烧、转换或其他魔力成本；B：指定成本修正 | [public][public] `publicPower` |
| `illusionists` 得分 | 公共魔力行动成功 | 无额外 | 3 人 +1 分，4–5 人 +2 分 | 每次成功 | 无新增 | 与折扣同一原子行动，失败不能保留奖励；A | [public][public] |
| `inventors` 初始能力板 | 正常选配/轮抽流程全部起始放置后 | 无 | 免费选 1 能力板并结算 G5 | 开局一次 | 能力板及其派生选择 | 不能只向数组塞 ID；B | [setup][setup] `finishPlacement` |
| `lizards` 起始科学 | 正常选配/轮抽完成，进入放置阶段时排队 | 无 | 两次任选轨 +1 | 开局一次 | 两次科学，可选同轨 | 在起始放置前处理；G4；A | [setup][setup] `beginPlacement` |
| `lizards` 城市奖励 | 成功领取城市板 | 无；本次工坊免费 | 1 铲（不可顺带建造）→另一次免费工坊机会 | 每次领取 | 地块/地形或放弃，然后可达家园空地或放弃 | 工坊依赖铲选择完成；不能用飞行/隧道扩大该免费工坊范围；B | [city][city]、[engine][engine] |
| `moles` 隧道 | 行动阶段改造/建造选择 tunnel；目标不是己方建筑直接/桥接相邻 | 1 工具，另付改造/建造费 | 距己方建筑六边形距离 ≤2；获得玩家数 +2 分 | 每次合法使用 | 目标、地形、是否建造 | `travelPaid` 仅由引擎生成，分步建造不重复扣费/加分；终局网络也用隧道可达性；C | [travel][travel]、[build][build]、[engine][engine]、[scoring][scoring] |
| `moles` 建桥行动 | 本人尚可执行主要行动 | 1 工具 | 排入免费桥位选择 | 不限每轮；每次占主要行动；总桥库存 3 | 桥两端或放弃 | 放弃不退已付工具；C（依赖特殊桥规则） | [special][special]、[effects][effects] |
| `moles` 桥几何 | 任意建桥渠道校验桥位 | 原渠道费用 | 普通桥位以外，还允许合法的非河流、不相邻且有两个共同邻格的端点 | 每次校验 | 桥位 | 仍需己方端点、未占用、桥库存；C | [bridge][bridge] |
| `monks` 特殊放置 | 正常选配/轮抽后的起始放置编排 | 无 | 最后放 1 大学，代替通常 2 工坊 | 开局一次 | 空置家园位置 | 改变多人放置顺序；C | [setup][setup] `beginPlacement`、[engine][engine] |
| `monks` 初始能力板 | 起始放置完成 | 无 | 免费选 1 能力板，结算 G5 | 开局一次 | 能力板 | 与普通大学升级入口分开；B | [setup][setup] `finishPlacement` |
| `navigators` 沿河工坊 | 行动阶段建筑奖励入口，结果为工坊且地图邻格含河流 | 原建造费用 | +2 分、+1 金币 | 每次符合条件的建造 | 无新增 | 与 SH12、沿河奖励板、轮次计分分别叠加；该入口不排除中立工坊；A | [effects][effects] `buildingRewards` |
| `omar` 特殊放置 | 正常选配/轮抽后的起始放置 | 无 | 2 工坊 +1 中立灯塔；三个本人放置槽可选尚未放完的建筑 | 开局一次 | 建筑种类、空置家园格 | 改变放置队列/选项；灯塔不等于取得 FAV1；C | [setup][setup]、[engine][engine] |
| `omar` 收入 | 收入阶段且属于该种族 | 无 | +2 金币、充能 2 | 每轮收入一次，含首轮 | 无 | 不依赖灯塔是否存在；A | [income][income] |
| `philosophers` 领取能力返书 | `takeCompetency` 成功 | 无额外 | 额外 +1 本该格颜色的书 | 每次领取 | 颜色固定，不自由选 | 在 G5 的 `row` 本书基础上加 1；A | [competency][competency] |
| `philosophers` 主动选书 | 本人特殊行动 | 无资源费；占主要行动 | 获得 1 本任选书 | 每轮一次 | 书色 | 来源 `faction:philosophers`；A | [special][special]、[responses][responses] |
| `psychics` 继续行动 | 本人特殊行动 | 无资源费 | 充能 5，保留恰好一个主要行动 | 每轮一次 | 无 | `extraActions` 与 `primaryDone` 联动，不是任意追加回合；C | [special][special]、[engine][engine] |

## 4. 家园地形（7）

种族与地形独立选取。共同初始魔力盘为 [5,7,0]、起始航海 0、学者 0；表中修改覆盖/叠加此基础。地形决定建筑家园合法性和改造距离，本表只列其额外特性。

| 内容 | 触发时机与条件 | 成本 | 效果 | 次数 | 交互 | 特殊规则/建议 | 依据 |
|---|---|---|---|---|---|---|---|
| `forest` 森林 | 开局初始化 | 无 | 四科学各 +1；初始盘 [4,8,0] | 一次 | 无 | 再叠加种族科学并结算阈值充能；A 数值模板 | [state][state] |
| `lake` 湖泊 | 初始化；航海升级校验 | 后续航海升级仍付 1 学者、4 金币，免费升级除外 | 起始航海 1；最大航海 4（通常 3） | 初始化一次；上限持续 | 升级到 4 获两本任选书 | 起始设等级不领取“升级到1”的分数；A 初始值 / B 上限修正 | [state][state]、[technology][technology] |
| `swamp` 沼泽 | 初始化 | 无 | 起始学者 1；初始盘 [3,9,0] | 一次 | 无 | 仍受后续学者供应约束；A | [state][state] |
| `mountain` 山地 | 每轮收入 | 无 | 额外 2 金币；有己方非中立商会则为 3 | 每轮一次 | 无 | 商会基础收入另算；不是每座商会多给 1；A 有界条件 | [income][income] |
| `desert` 沙漠 | 正常起始放置完成 | 免费 1 铲；补购受原规则约束 | 1 铲改造机会 | 开局一次 | 地块、地形或放弃 | 禁止 build/deferBuild；B | [setup][setup]、[engine][engine] |
| `plains` 平原 | 自费提升改造科技 | 1 工具、1 学者、1 金币（通常金币 5） | 改造科技 +1，正常领取升级奖励 | 受科技上限 2 约束 | 升级到1产生书色选择 | 只改此类成本；B | [technology][technology] |
| `wasteland` 荒地 | 初始化；进入起始放置；取得第二块革新 | 第二块仍付 5 本书并满足颜色要求；无宫殿仍付 5 金币 | 起始工具 +1；任选书 1；第二块革新不加价 | 开局各一次；第二块一次 | 起始书色、研发书支付 | 第三块仍为 7 本；A 初始奖励 / B 成本修正 | [state][state]、[setup][setup]、[public][public] |

## 5. 宫殿（17，含 SH-X1）

### 5.1 持续收入

每行共同条件：已建成并激活该宫殿（G6）；时机：收入阶段；成本：无额外；次数：每次收入一次；书籍逐本选色，其余无直接选择。全部是 A 类固定收入。依据 [content][content] 的 `income` 字段、[income][income] 和 [rounds][rounds]；“—”表示该宫殿没有额外收入。

| 编号 / 稳定 ID | 金币 | 工具 | 学者 | 充能 | 任选书 |
|---|---|---|---|---|---|
| SH1 `tools-special` | 0 | 0 | 0 | 5 | 0 |
| SH2 `spades-special` | — | — | — | — | — |
| SH3 `downgrade-special` | 0 | 0 | 0 | 2 | 0 |
| SH4 `upgrade-special` | 0 | 0 | 0 | 2 | 0 |
| SH5 `competency-palace` | 0 | 0 | 0 | 4 | 0 |
| SH6 `science-special` | 0 | 0 | 0 | 2 | 1 |
| SH7 `school-pass` | 0 | 0 | 0 | 4 | 0 |
| SH8 `city-discount` | 2 | 1 | 0 | 2 | 0 |
| SH9 `flight` | 0 | 0 | 1 | 0 | 0 |
| SH10 `power-books` | 6 | 0 | 0 | 0 | 0 |
| SH11 `city-palace` | 0 | 1 | 0 | 0 | 0 |
| SH12 `workshop-score` | 0 | 0 | 0 | 8 | 0 |
| SH13 `guild-special` | — | — | — | — | — |
| SH14 `river-city` | 0 | 0 | 0 | 6 | 0 |
| SH15 `engineering-palace` | 0 | 0 | 0 | 6 | 0 |
| SH16 `remote-guild` | 0 | 0 | 0 | 2 | 1 |
| SH-X1 `immediate-score` | 0 | 0 | 0 | 2 | 0 |

### 5.2 即时、主动与规则修改

| 内容/能力 | 触发时机与条件 | 成本 | 实际效果 | 次数限制 | 交互 | 特殊规则/建议 | 依据 |
|---|---|---|---|---|---|---|---|
| SH1 `tools-special` | 已激活；本人特殊行动 | 无；占主要行动 | +2 工具 | 每轮一次 | 无 | A | [special][special] |
| SH2 `spades-special` | 已激活；本人特殊行动 | 无；工坊/补购另付 | 2 免费铲，可附带一次工坊建造 | 每轮一次 | 地块、目标地形、补购/建造或放弃 | 多地块及 G8；B | [special][special]、[build][build] |
| SH3 `downgrade-special` | 已激活；选择己方非中立学院；有商会库存 | 无；占主要行动 | 学院降为商会；+3 分、+1 工具 | 每轮一次 | 学院位置 | 归还学院库存；触发商会奖励、轮次商会分、蹭魔和建城；B | [special][special] |
| SH4 `upgrade-special` | 已激活；合法己方非中立工坊 | 不付升级资源；占主要行动 | 工坊免费升商会 | 每轮一次 | 工坊位置 | 仍需商会库存；完整升级连锁；B | [special][special]、[build][build] |
| SH5 `competency-palace` | 宫殿建成 | 建造费外无额外 | 选一块能力板并结算 G5 | 建成一次 | 能力板及派生选择 | B | [effects][effects]、[competency][competency] |
| SH6 `science-special` | 已激活；本人特殊行动 | 无；占主要行动 | 同一选定轨最多推进 2 | 每轮一次 | 在行动中选轨，可能再问钥匙 | 非两次自由分配；G4；A | [special][special]、[science][science] |
| SH7 `school-pass` | 本人 pass，含第6轮 | 无额外 | 每座己方学院 +3 分 | 每次 pass | 无 | `ownBuildings` 包含中立学院；A 计数 | [rounds][rounds] |
| SH8 `city-discount` | 城市检测且宫殿已激活 | 无额外 | 城市建筑魔力门槛 7→6 | 持续 | 城市形成后选城市板 | 所需建筑数量不变；C | [city][city] |
| SH9 `flight` | 行动阶段选择 flight；非直接/桥接相邻 | 1 学者，另付改造/建造费 | 距己方建筑 ≤3；+5 分 | 每次合法使用 | 目标、地形、建造选择 | 分步通行授权与终局网络同鼹鼠；C | [travel][travel]、[build][build]、[scoring][scoring] |
| SH10 `power-books` | 宫殿建成 | 建造费外无额外 | 充能 12；任选书 2 | 建成一次 | 两次独立书色 | 充能不是增加12个标记；A | [effects][effects] |
| SH11 `city-palace` | 宫殿建成 | 建造费外无额外 | 直接领取 1 城市板 | 建成一次 | 有库存的城市板 | 获钥匙、城市奖励、种族城市奖励及行动阶段城市轮次分；不要求建筑群；B | [effects][effects]、[city][city] |
| SH12 `workshop-score` | 行动阶段工坊建筑奖励入口 | 原建造费 | +2 分 | 每次工坊 | 无 | 可叠加其他来源；该入口含中立工坊；A | [effects][effects] |
| SH13 `guild-special` 计分 | 行动阶段商会建筑奖励入口 | 原行动费 | +3 分 | 每次商会 | 无 | 升级/降级/远方免费/中立商会均可能进入；A | [effects][effects] |
| SH13 `guild-special` 主动 | 已激活；本人特殊行动 | 无；占主要行动 | +3 金币、任选书 1 | 每轮一次 | 书色 | A | [special][special] |
| SH14 `river-city` 即时 | 宫殿建成 | 两次升级免费 | 航海提升两次，正常领取升级奖励 | 建成一次 | 可能产生书色选择 | 到上限后多余免费升级无效果；B | [effects][effects]、[technology][technology] |
| SH14 `river-city` 河流连接 | 本人行动阶段、无待选、选尚未被使用的河流格，必须实际形成城市 | 无资源费；不消耗主要行动 | 为本人城市检测添加该河流邻格间连接 | 代码无每轮计数；每河流格全局只能使用一次 | 河流格、城市板及派生奖励 | 不改变普通可达或终局网络；空连不成城回滚；C | [engine][engine] `riverCity`、[city][city] |
| SH15 `engineering-palace` | 宫殿建成 | 建造费外无额外；铲后工坊仍付费 | 2 铲、2 桥、2 本书 | 建成一次 | 三组奖励顺序；组内地块/桥/书色 | 选组后连续处理；新城市等奖励等待宫殿奖励；对手蹭魔可穿插；C | [effects][effects]、[engine][engine] |
| SH16 `remote-guild` | 宫殿建成，存在家园空地且有商会库存 | 该商会免费 | 任意家园空地放商会 | 建成一次 | 地块 | 不检查普通可达；可用本次升级归还的商会；触发建筑/城市/蹭魔连锁；无位置/库存则不排队；B | [effects][effects]、[engine][engine] |
| SH-X1 `immediate-score` | 宫殿建成 | 建造费外无额外 | +10 分 | 建成一次 | 无 | A；保留项，不在顺蛇/逆蛇宫殿池；旧选配/开发预设仍可能含它 | [effects][effects]、[setup][setup] |

## 6. 奖励板（10）

收入都在每轮收入阶段、当前持有时发生，无额外费用。结束本轮能力使用交回前的板；新板及其积累金币在之后领取。首轮持有和后续换板是同一能力定义。

| 编号 / ID | 触发与条件 | 成本 | 效果 | 次数 | 交互 | 特殊规则/建议 | 依据 |
|---|---|---|---|---|---|---|---|
| BON10 `coins` | 当前持有；收入 | 无 | +6 金币 | 每轮一次 | 无 | A | [income][income] |
| BON9 `power` | 当前持有；收入 | 无 | +2 金币、充能4 | 每轮一次 | 无 | A；G3 | [income][income] |
| BON-P3 `guild` | 收入；行动阶段商会建筑奖励 | 原建筑行动费 | 收入充能3；每次商会 +3 分 | 收入每轮；计分每次 | 无新增 | 可与 SH13 叠加；中立同样进入奖励入口；A | [income][income]、[effects][effects] |
| BON-P4 `scholar` | 收入；派遣学者行动成功 | 派遣付1学者 | 收入1学者；派遣 +2 分 | 收入每轮；计分每次派遣 | 原行动选轨/槽或退回供应 | `slot:null` 也触发；与 FAV8 叠加；A | [income][income]、[engine][engine] |
| BON8 `school` | 收入；本人 pass | 无额外 | 收入4金币；每座学院一次任选科学+1 | 收入每轮；pass每次 | 每座学院单独选轨 | 第6轮也做；含中立学院；A | [income][income]、[rounds][rounds] |
| BON-P6 `bigbuilding` | 收入；本人 pass | 无额外 | 收入1工具；每座宫殿/大学 +4分 | 收入每轮；pass每次 | 无 | 含同类型中立建筑；A | [income][income]、[rounds][rounds] |
| BON-P7 `river` 范围 | 可达性计算、当前持有 | 原行动费 | 临时航海可达范围 +1 | 持续 | 原地块选择 | 不改永久航海，不用于终局网络；影响改造、中立放置、免费工坊；C | [build][build]、[neutral][neutral]、[engine][engine]、[scoring][scoring] |
| BON-P7 `river` 得分 | 行动阶段沿河工坊建筑奖励 | 原建造费 | +2分 | 每次 | 无新增 | 无收入；不按轮末存量计分；A | [effects][effects] |
| BON5 `spade-bonus` | 收入；本人特殊行动 | 主动占主要行动；工坊/补购另付 | 收入任选书1；主动1免费铲可建工坊 | 收入每轮；主动每轮一次 | 书色；地块/地形/建造或放弃 | A收入 / B主动；G8 | [income][income]、[special][special]、[build][build] |
| BON-P9 `bridge-bonus` | 收入；本人特殊行动 | 主动无资源费，占主要行动 | 收入任选书1；主动免费桥1 | 收入每轮；主动每轮一次 | 书色；合法桥两端或放弃 | 桥库存/端点归属仍检查；A收入 / B桥 | [income][income]、[special][special]、[bridge][bridge] |
| BON7 `science-bonus` | 收入；本人特殊行动 | 主动无资源费，占主要行动 | 收入2工具；主动指定科学+1 | 收入每轮；主动每轮一次 | 行动直接选轨，可能问钥匙 | A；G4 | [income][income]、[special][special] |

## 7. 能力板（12）

以下每项取得时均先执行 G5，表中只列板块自身附加效果。未持有不能生效，不可重复取得同一 ID。

| 编号 / ID | 触发与条件 | 成本 | 效果 | 次数 | 交互 | 特殊规则/建议 | 依据 |
|---|---|---|---|---|---|---|---|
| FAV12 `income-tool-science` | 每轮收入，已持有 | 无 | +1工具，任选科学+1 | 每轮一次 | 选轨/钥匙 | 收入中跨9立刻补该轨收入；A | [income][income]、[science][science] |
| FAV6 `two-spades` | 取得能力板 | G5外无额外 | 2免费铲 | 取得一次 | 地块/地形，允许时建造，或放弃 | 开局 setup 中铲不能建造；行动阶段可付费建造；B | [competency][competency]、[engine][engine] |
| FAV8 `scholar-score` | 派遣学者成功，已持有 | 原派遣1学者 | +2分 | 每次派遣 | 原选轨/槽 | `slot:null` 也触发；A | [engine][engine] |
| FAV10 `border-score` | 行动阶段工坊建筑奖励，地块邻格数<6 | 原建造费 | +3分 | 每次符合条件 | 无新增 | 固定地图几何判断，含中立工坊入口；A，只开放固定谓词 | [effects][effects] |
| FAV9 `income-vp-coins` | 每轮收入，已持有 | 无 | +3分、+2金币 | 每轮一次 | 无 | A | [income][income] |
| FAV2 `annexes` 库存 | 取得能力板 | 无额外 | 附属建筑库存 +2 | 取得一次 | 无直接选择 | 库存不会立即改变建筑；B | [competency][competency] |
| FAV2 `annexes` 放置 | 本人特殊行动，有库存；己方尚无附属建筑的建筑 | 消耗1库存，占主要行动 | 给该建筑加附属：建城计数额外+1、建筑魔力+1 | 不按轮重置；每建筑最多1 | 己方建筑 | 当前条件不排除中立建筑；不蹭魔、不触发普通建筑奖励，但查建城；C | [special][special]、[responses][responses]、[city][city] |
| FAV1 `tower` 即时 | 取得能力板，存在可支付改造费的合法中立放置点 | 放置付改造工具，无普通建筑费 | 放置中立灯塔 | 取得时一次 | 可达地块 | 无合法点不排队；有点时先解决中立放置；B | [competency][competency]、[neutral][neutral]、[engine][engine] |
| FAV1 `tower` 收入 | 已持有能力板 | 无 | +2金币、充能2 | 每轮一次 | 无 | 按持有能力板判断，不是按地图灯塔数量；A | [income][income] |
| FAV7 `income-book-power` | 每轮收入，已持有 | 无 | 任选书1、充能1 | 每轮一次 | 书色 | A | [income][income] |
| FAV11 `immediate-resources` | 取得能力板 | 无额外 | +1工具、+2金币、+5分 | 取得一次 | 无新增 | G5行列奖励另算；A | [competency][competency] |
| FAV3 `power-special` | 已持有；本人特殊行动 | 无资源费，占主要行动 | 充能4 | 每轮一次 | 无 | A | [special][special] |
| FAV5 `city-pass` | 本人 pass，已持有 | 无 | `keys × 2` 分 | 每次 pass | 无 | 代码计累计钥匙，不扣 `keysUsed`；包括直接领取城市板；A | [rounds][rounds] |
| FAV4 `min-science-pass` | 本人 pass，已持有 | 无 | 最低实际科学等级对应分数 | 每次 pass | 无 | 不用天佑者虚增等级；A | [rounds][rounds] |

## 8. 革新（18）

“取得时”均先满足 G7；表中成本为研发之外的附加成本。即时计分依据取得当时局面，不在以后动态重算。己方建筑统计默认包含中立建筑，详见 G9。

| 编号 / ID | 触发与条件 | 附加成本 | 效果 | 次数 | 交互 | 特殊规则/建议 | 依据 |
|---|---|---|---|---|---|---|---|
| INN1 `deus-ex-machina` 即时 | 取得 | 无 | 任选书1；四科学各+1 | 取得一次 | 书色、可能多个钥匙响应 | A；钥匙优先于同人其他奖励 | [effects][effects]、[engine][engine] |
| INN1 `deus-ex-machina` 主动 | 已持有；本人特殊行动 | 占主要行动，工坊/补购另付 | 1免费铲，可建工坊 | 每轮一次 | 地块/地形/建造或放弃 | B；G8 | [special][special] |
| INN2 `trading-routes` | 本人 pass，已持有 | 无 | 每座商会 +2分 | 每次 pass | 无 | 含中立商会；A | [rounds][rounds] |
| INN3 `professors` | 已持有；本人特殊行动 | 占主要行动 | +1学者、+3分 | 每轮一次 | 无 | 学者满供应也不会增加库存，得分照常；A | [special][special]、[internal][internal] |
| INN4 `architecture` | 取得 | 无 | +10分；每种不同 `BuildingKind` 一次任选科学+1 | 取得一次 | 按种类数逐次选轨 | 包含中立建筑种类；同类型普通/中立只算一种；附属不另算类型；A有限计数 | [public][public] |
| INN5 `census` | 取得 | 无 | 建筑数7–8/9–10/≥11分别8/12/18分，不足7为0 | 取得一次 | 无 | 附属不增加这里的建筑条目数；A阈值表 | [public][public] |
| INN6 `colleges` | 取得 | 无 | 每座学院5分 | 取得一次 | 无 | 含中立学院；A | [public][public] |
| INN7 `communications` | 取得 | 无 | 相邻/己方桥连接建筑群数4/5/≥6分别8/12/18分，否则0 | 取得一次 | 无 | 不把航海、隧道、飞行或 SH14 河流连接算作此处邻接；C图算法 | [public][public]、[map][map] |
| INN8 `league-of-cities` | 取得 | 无 | `keys × 5` 分 | 取得一次 | 无 | 是累计城市板钥匙数，不是地图 cityId 去重数；A | [public][public] |
| INN9 `libraries` | 取得 | 无 | 最高两项实际科学等级之和得分 | 取得一次 | 无 | 不用虚拟轮末等级；A固定指标 | [public][public] |
| INN10 `sewerage` | 取得 | 无 | 每座工坊2分 | 取得一次 | 无 | 含中立工坊；A | [public][public] |
| INN11 `steam-power` | 取得 | 无 | +1学者；免费升改造/航海各一级 | 取得一次 | 可能有书色选择 | 上限处免费升级跳过；正常升级奖励/行动阶段轮次分；B | [effects][effects]、[technology][technology] |
| INN12 `steel` | 取得 | 无 | 己方桥0/1/2/3座给0/8/12/18分 | 取得一次 | 无 | 以桥数组归属计数；A阈值表 | [public][public] |
| INN13 `neutral-workshop` | 取得；之后收入 | 中立放置需改造工具 | 即时放中立工坊；每轮+3工具 | 放置一次；收入每轮 | 中立地块 | 中立放置触发建筑/轮次/蹭魔/城市；不算普通基础工坊收入；B放置/A收入 | [effects][effects]、[neutral][neutral]、[income][income] |
| INN14 `neutral-guild` | 取得；之后收入 | 同上 | 即时放中立商会；每轮+5金币 | 同上 | 中立地块 | 可触发商会奖励；B放置/A收入 | 同上 |
| INN15 `neutral-school` | 取得 | 同上 | 排入中立学院放置及能力板选择 | 各一次 | 先中立地块，再能力板及派生选择 | 不靠普通升级入口触发能力板；B | [effects][effects]、[engine][engine] |
| E14 `neutral-university` | 取得；之后收入 | 同上 | 即时放中立大学；每轮+2分 | 放置一次；收入每轮 | 中立地块 | 当前无额外能力板奖励；B放置/A收入 | [effects][effects]、[income][income] |
| INN17 `neutral-palace` | 取得；之后收入 | 同上 | 排入中立宫殿放置；碗III直接增加2标记；每轮充能4 | 即时一次；收入每轮 | 中立地块 | 不激活玩家宫殿能力，也不免以后无宫殿研发的5金币；增加标记≠充能；B | [effects][effects]、[public][public]、[income][income] |
| INN18 `neutral-monument` | 取得；之后建城检测 | 同上 | 排入纪念碑放置并立即+7分；纪念碑建筑魔力4，其城市建筑数门槛为2 | 放置/得分一次；门槛持续 | 中立地块、可能城市板 | 仍需城市魔力总值门槛；B放置/A得分/C建城 | [effects][effects]、[responses][responses]、[city][city] |

所有 `neutral-*` 的收入及附带奖励按持有革新执行：`queueNeutral` 无合法位置时会跳过放置，不会取消已获得的革新或后续收入/附加效果。这是当前代码事实；在设计通用配置时必须明确“不能执行一个效果时，其余效果怎么办”，不能自行改变成整个研发失败。

## 9. 复用环境补充

### 9.1 城市板（7）

共同触发：`takeCity`，来自实际建城或 SH11；条件：板有库存；成本：无额外资源；次数：每次领取，单种初始库存3；交互：先选板，再解决表中选择。全部额外获得1累计钥匙，触发种族城市奖励和行动阶段城市轮次分。领取入口归 B，普通资源子效果归 A。依据 [city][city]、[state][state]。

| 项目编号 / ID | 固定得分 | 附加效果与交互 | 特殊边界 |
|---|---|---|---|
| TW1 `tools` | 4 | +3工具，无新增选择 | 同时执行所有城市领取触发 |
| TW2 `spades` | 5 | 2免费铲，选择地块/地形/允许时建造或放弃 | G8；工坊非免费 |
| TW3 `books` | 5 | 两本任选书，分别选色 | 两个持久化待选项 |
| TW4 `coins` | 6 | +6金币 | 无新增选择 |
| TW5 `science` | 7 | 四科学各+1 | 可产生钥匙响应；新领钥匙可参与判断 |
| TW6 `power` | 8 | 充能8 | G3容量限制 |
| TW7 `scholar` | 8 | +1学者 | G3供应限制 |

### 9.2 轮次板（12）与第六轮附加板（4）

左侧分数仅行动阶段对应事件发生时执行，不消耗额外资源，按每次事件/实际数量计。右侧奖励在全员 pass 后按指定科学的整倍数计算，只有第1–5轮；不耗额外资源，每轮一次。书逐本选色；铲按 pass 顺序处理，不能买铲或建造。天佑者仅修正右侧计算。依据 [round-scoring][round-scoring]、[rounds][rounds]；首版 DIY 不开放修改这些公共板。

| 稳定 ID | 行动阶段得分 | 轮末科学奖励（向下取整） |
|---|---|---|
| `workshop-law` | 每工坊2分 | 每3法学→1学者 |
| `workshop-bank` | 每工坊2分 | 每3银行学→充能4 |
| `guild-law` | 每商会3分 | 每3法学→任选书1 |
| `guild-medicine` | 每商会3分 | 每4医学→铲1 |
| `school-bank` | 每学院4分 | 每1银行学→金币1 |
| `big-medicine` | 每宫殿/大学5分 | 每2医学→工具1 |
| `big-bank` | 每宫殿/大学5分 | 每2银行学→工具1 |
| `spade-engineering` | 每实际用铲2分 | 每1工程学→金币1 |
| `science-medicine` | 每实际科学推进1分 | 每3医学→任选书1 |
| `city-engineering` | 每领取城市板5分 | 每4工程学→铲1 |
| `advance-engineering` | 每科技升级3分 | 每3工程学→学者1 |
| `innovation-law` | 每取得革新5分 | 每2法学→充能3 |

| 第六轮附加板 ID | 触发与效果 | 条件/成本/限制/交互 |
|---|---|---|
| `workshop` | 每工坊事件+2分 | 仅第6轮行动阶段；无额外费；每次；无新增选择 |
| `guild` | 每商会事件+3分 | 同上 |
| `school` | 每学院事件+4分 | 同上 |
| `border` | 每边缘工坊+3分 | 同上；在 `buildingRewards` 检查邻格数<6，可叠 FAV10 |

### 9.3 公共魔力行动（6）

共同条件：本人主要行动、该格本轮未被占用；成功后全体共享占用该格，下一轮清空。幻术师减1支付并得分。魔力从III移至I，不销毁标记。依据 [public][public]，地图子操作是 B。

| ID | 魔力成本 | 效果 | 交互与附加条件 |
|---|---|---|---|
| `scholar` | 3 | +1学者 | 无新增选择，受供应限制 |
| `bridge` | 3 | 放桥1 | 行动直接选桥两端，合法性/库存必须通过 |
| `tools` | 4 | +2工具 | 无 |
| `coins` | 4 | +7金币 | 无 |
| `spade` | 4 | 1免费铲及可选工坊 | 行动中直接给改造目标；工坊/补购另付 |
| `spades` | 6 | 2免费铲及可选工坊 | 可多地块；G8 |

### 9.4 书籍行动（6）

共同条件：行动在本局公共书籍池、该格本轮未用；付款数组四项非负整数且合计恰好达到成本；颜色自由。每次占主要行动，全体共享每轮一次。依据 [books][books]。

| ID | 书成本 | 效果 | 交互/特殊规则 |
|---|---|---|---|
| `power` | 1 | 充能5 | 选付款颜色；G3 |
| `science` | 1 | 指定科学+2 | 付款颜色、科学轨、可能钥匙；G4 |
| `coins` | 2 | +6金币 | 选付款颜色 |
| `upgrade` | 2 | 工坊免费升商会 | 付款颜色、工坊；仍检查库存与完整升级连锁 |
| `guild-score` | 2 | 每座己方商会2分 | 付款颜色；含中立商会 |
| `spades` | 3 | 排入3免费铲 | 付款后选改造/建造或放弃；工坊/补购另付 |

### 9.5 基础收入与科技奖励

这些是上述能力效果所依赖的固定规则，不是首版用户可覆盖的全局配置。

- 每轮基础建筑收入只计非中立：每工坊1工具；每商会2金币，商会总数0/1/2/3/4对应总充能0/1/2/4/6；每学院/大学1学者。
- 科学达到9级后的收入依轨为3金币、充能6、1工具、3学者；收入中刚跨9的补发见G4。
- 航海自费为1学者4金币；升到1/3级给2/4分，2/4级给两本任选书。改造科技自费为1工具1学者5金币（平原1金币）；升到1级给两书，2级给6分。免费提升也领取奖励，到上限则跳过。
- 终局网络、科学排名、剩余资源换分属于固定结算规则；详见 [scoring][scoring]。本轮没有把终局算法改造成 DIY 入口。

## 10. 测试依据与本次验证

本次执行：`node node_modules/vitest/vitest.mjs run packages/rules/test apps/web/test/player-income.test.tsx`，**32 文件、353 用例通过**。本次仅新增文档，未运行浏览器、数据库或部署验收。既有测试通过不代表76项每一字段都有独立测试，更不代表任意 DIY 组合已通过验证。

另从当前内容模块读取各类 ID，核对76项均出现在相应章节、12个轮次ID无遗漏，显示编号与当前代码一致；两份文档的本地链接、表格列数和JSON示例均通过结构检查。

| 测试文件 | 能支持的盘点结论 | 不能扩大解释为 |
|---|---|---|
| [content-semantics][test-content] | 84种族/家园起始组合，种族、宫殿、奖励板、地形定向行为，主动限制及跨轮恢复 | 所有能力板/革新数值、所有内容组合穷举；其 BON 测试标题仍有旧编号 |
| [complex-rewards][test-complex] | 全17宫殿收入独立数值，SH15组顺序、分步建造，商会多来源分数 | 任意奖励批次都已有通用实现 |
| [competencies][test-competency]、[neutral][test-neutral] | 能力市场行列/重复限制、部分能力主动/收入/pass、灯塔和附属建筑 | 12能力每一边界均独立覆盖 |
| [expanded-content][test-expanded] | 17宫殿和18革新入口可执行；部分收入及种族行为 | 18革新所有阈值和选择都逐项语义验收；入口测试主要断言取得成功 |
| [phase-boundaries][test-phase]、[trigger-boundaries][test-trigger]、[sequencing][test-sequence] | 城市板事件、阶段计分、末轮待选、奖励优先、旧版分派 | 整个未来配置事件系统已存在 |
| [player-income][test-income] | 个人收入展示相关回归 | 任意用户脚本可自动预览 |

## 11. 设计前应保留的差异与待核实项

| 编号 | 当前证据/差异 | 后续处理建议 |
|---|---|---|
| Q1 | `takeCity` 才执行猫人、蜥蜴人和城市轮次奖励；SH11也调用它 | 配置事件用“城市板领取成功”，另设“城市群形成”，禁止混用 |
| Q2 | 多数 `pass`/革新计数用包含中立的 `ownBuildings`，基础收入和库存却排除中立 | 指标必须显式说明是否包含中立、附属是否算数量；不能只写 `buildingCount` |
| Q3 | 无选配/轮抽的 `createGame` 开发/夹具路径没有执行完整的 `beginPlacement/finishPlacement` 种族流程 | 首版导入应走正式开局流程；迁移时另测直接预设兼容，不把夹具行为泛化为正常游戏 |
| Q4 | SH14代码限制为每河流格全局一次、每次必须形成城市，没有每轮/每局一次计数 | 表按代码记录；若要改变次数/排他语义，需另作规则核实，不能在抽象时顺手改动 |
| Q5 | 中立放置无合法点会跳过，附带收入/分数等仍获得；SH16无位置或商会库存也跳过放置 | 配置需区分 `skipEffect` 与 `rejectAction`；为这些边界补定向预期测试 |
| Q6 | 收入来源目前部分通过中文 `source` 字符串推导待选来源；SH15优先判断依赖具体ID前缀 | 改为稳定来源ID/显式批次策略后再开放通用组合；文案不能承担执行分派 |
| Q7 | 科学奖励多次选轨、一次同轨+2、四轨各+1是三种不同交互；多书自动拆开 | 配置必须写选择方式；不能统一成“science:2” |
| Q8 | 18革新存在逐项入口测试，但不足以确认每个阈值、计数范围、无合法位置组合 | 首版吸收相应指标/效果前，针对盘点中的独立数值补测试；不把来源说明当成验收 |
| Q9 | 前端已有直接调用共享规则的收入路径，但特殊行动选项、目标选择、编号/i18n仍有固定内容逻辑 | 能力执行接口与展示/选项接口一同设计；仅迁移后端分支不足以开放DIY |

本次没有修改这些行为。A/B/C划分与下一份文档的首版范围供实现时评审；尤其不能将“存在底层函数”理解成“用户现在能安全配置任意调用”。

[content]: ../../packages/rules/src/content.ts
[catalog]: ../../packages/rules/src/catalog.ts
[state]: ../../packages/rules/src/state.ts
[setup]: ../../packages/rules/src/setup.ts
[income]: ../../packages/rules/src/income.ts
[rounds]: ../../packages/rules/src/rounds.ts
[effects]: ../../packages/rules/src/effects.ts
[engine]: ../../packages/rules/src/engine.ts
[responses]: ../../packages/rules/src/responses.ts
[special]: ../../packages/rules/src/actions/special.ts
[competency]: ../../packages/rules/src/actions/competency.ts
[public]: ../../packages/rules/src/actions/public.ts
[books]: ../../packages/rules/src/actions/books.ts
[city]: ../../packages/rules/src/actions/city.ts
[science]: ../../packages/rules/src/actions/science.ts
[power]: ../../packages/rules/src/actions/power.ts
[build]: ../../packages/rules/src/actions/build.ts
[bridge]: ../../packages/rules/src/actions/bridge.ts
[neutral]: ../../packages/rules/src/actions/neutral.ts
[travel]: ../../packages/rules/src/travel.ts
[technology]: ../../packages/rules/src/technology.ts
[map]: ../../packages/rules/src/map.ts
[scoring]: ../../packages/rules/src/scoring.ts
[round-scoring]: ../../packages/rules/src/round-scoring.ts
[internal]: ../../packages/rules/src/internal.ts
[score-events]: ../../packages/rules/src/score-events.ts
[replay]: ../../packages/rules/src/replay.ts
[codes]: ../../apps/web/src/i18n/tile-codes.ts
[test-content]: ../../packages/rules/test/content-semantics.test.ts
[test-complex]: ../../packages/rules/test/complex-rewards.test.ts
[test-competency]: ../../packages/rules/test/competencies.test.ts
[test-neutral]: ../../packages/rules/test/neutral.test.ts
[test-expanded]: ../../packages/rules/test/expanded-content.test.ts
[test-phase]: ../../packages/rules/test/phase-boundaries.test.ts
[test-trigger]: ../../packages/rules/test/trigger-boundaries.test.ts
[test-sequence]: ../../packages/rules/test/sequencing.test.ts
[test-income]: ../../apps/web/test/player-income.test.tsx
