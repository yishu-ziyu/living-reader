# Grok Teable 轮询 Loop（一本书 · 控制面）

**SSOT = Teable**，不是聊天。口头「你可以干活」不算开单。

| ID | 用途 |
|----|------|
| base | `bseb5kz1csAGvxx3I0N` |
| 工作区 | `/Users/mahaoxuan/Desktop/一本书` |

---

## 库里有什么（整库）

```text
base bseb5kz1csAGvxx3I0N
├── 开发任务     tblaDw7ZIclyAaeF1ik   ← Grok 主操作面
├── 验收与回归   tbl1LYOkZBFroGxql4M   ← 关联用例 A003/A021…
├── 功能与发现   tblBfH6hrMehGIHKTeD   ← 功能/缺陷 Fxx
├── 迭代计划     tbl1HVokiDtP1IpY2BS
├── 架构决策     tbl9BdVr8PRv0x7AkU9   ← ADR
├── app 研发任务总览 / 小王子练习场
└── workflow 新自动化
```

Grok **写**：只动 `开发任务` 的 `状态` + `验收证据`（领取/交验收）。  
Grok **读**：开发任务全字段 + 链接出的验收用例/缺陷证据。  
Grok **不写**：完成状态、不擅自改验收用例状态（Codex/人标）。

---

## 开发任务：字段怎么读

### 调度字段（决定领不领）

| 中文名 | dbFieldName | 作用 |
|--------|-------------|------|
| 状态 | `Zhuang_Tai` | 生命周期：待细化/已就绪/开发中/待验收/回归中/阻塞/完成/取消 |
| Grok就绪 | `GrokJiu_Xu` | checkbox；与已就绪一起构成可领 |
| 负责人 | `Fu_Ze_Ren` | Grok / Codex / 用户 / 未分配 |
| 优先级 | `You_Xian_Ji` | P0–P3；可领取视图排序 |
| 任务编号 | `Ren_Wu_Bian_Hao` | 自动编号；同优先级再排序 |
| 任务标题 | `Ren_Wu_Biao_Ti` | 展示 |

视图 **Grok 可领取** `viwI2hZLRxiVMj5rriQ` = `状态=已就绪` ∧ `Grok就绪=true`。

### 开工必读（领取后 b 步完整读）

| 中文名 | dbFieldName | 何时 |
|--------|-------------|------|
| 任务说明 | `Ren_Wu_Shuo_Ming` | 背景 |
| **范围内** | `Fan_Wei_Nei` | 做什么 |
| **不在范围** | `Bu_Zai_Fan_Wei` | 禁区 |
| **技术方案** | `Ji_Shu_Fang_An` | 合同/主链 |
| **开发指令** | `Kai_Fa_Zhi_Ling` | 阶段/并行 lane |
| **目标路径** | `Mu_Biao_Lu_Jing` | 允许改的路径 |
| **验收标准** | `Yan_Shou_Biao_Zhun` | 怎样算完 |
| **验收命令** | `Yan_Shou_Ming_Ling` | 必跑命令 |
| **验收证据** | `Yan_Shou_Zheng_Ju` | **返工时优先读**（Codex 退回项写在这里） |
| 风险与回滚 | `Feng_Xian_Yu_Hui_Gun` | 风险 |
| 阻塞原因 | `Zu_Sai_Yuan_Yin` | 若阻塞 |

### 链接字段（读关联，不瞎改）

| 中文名 | 链到 | 用途 |
|--------|------|------|
| 验收与回归 | `tbl1LYOkZBFroGxql4M` | A0xx 用例；退回时看失败用例 |
| 关联功能 | `tblBfH6hrMehGIHKTeD` | 功能/缺陷 Fxx |
| 关联ADR | `tbl9BdVr8PRv0x7AkU9` | 架构约束 |
| 所属计划 | `tbl1HVokiDtP1IpY2BS` | 里程碑 |
| 依赖任务 | 开发任务 self | 前置是否完成 |

### Grok 允许写回

| 字段 | 写什么 |
|------|--------|
| 状态 | 领取→`开发中`；做完→`待验收` |
| 验收证据 | 真实命令结果 + 返工对照；禁止编造 |

**禁止** 写 `完成`。

---

## 口语 ↔ 状态

| 口语 | Teable |
|------|--------|
| 已就绪 / Grok 可领取 | **同一意思**；视图见上 |
| 已领取 / 进行中 | **开发中** |
| 交 Codex | **待验收** |
| Codex 回归中 | **回归中** |
| 验收失败退回 | **已就绪** + Grok就绪=true → **返工归 Grok** |

---

## 每 5 分钟分支

| 条件 | 动作 |
|------|------|
| 在途 **开发中** | **接着做完** → 证据 → **待验收**（禁止只报一行） |
| 在途 **待验收 / 回归中** | 安静（等 Codex） |
| 可领取 ≥1 且无在途 | 领 1 条 → 同轮 a→e |
| 可领取空且无在途 | 安静 |

### 领取 a→e（同轮）

1. 状态 → 开发中  
2. 读上表「开工必读」+ 链接验收用例  
3. 做到验收标准  
4. 写验收证据  
5. 状态 → 待验收  

### 返工

可领取里出现任务 = Codex 退回。**必读 `验收证据` 全文**（固定返工项 Fxx/P0）→ 改代码 → 跑验收命令 → 覆盖证据 → 待验收。

---

## 验收与回归（读）

用例字段：用例标题/编号、类型、层级、**状态**（未执行/通过/失败/阻塞）、阻断发布、前置条件、用户行动、可见结果、自动化方式、**证据**、关联任务。

返工时：对任务链上的失败用例（如 A003/A021–A023）对照「可见结果 / 证据」。

---

## 功能与发现（读）

缺陷 Fxx 在此：类型=缺陷、流程阶段、问题陈述、当前证据、下一步。开发任务「关联功能」会指到这里。

---

## 常用命令

```bash
# 可领取
teable record get -b bseb5kz1csAGvxx3I0N --table-id tblaDw7ZIclyAaeF1ik --view-id viwI2hZLRxiVMj5rriQ --pretty

# 在途
teable sql-query -b bseb5kz1csAGvxx3I0N --sql \
'SELECT "Ren_Wu_Bian_Hao","Ren_Wu_Biao_Ti","Zhuang_Tai","Fu_Ze_Ren","GrokJiu_Xu"
 FROM "bseb5kz1csAGvxx3I0N"."tblaDw7ZIclyAaeF1ik"
 WHERE "Fu_Ze_Ren"='\''Grok'\'' AND "Zhuang_Tai" IN ('\''开发中'\'','\''待验收'\'','\''回归中'\'')'

# 全表扫一眼（有疑义必跑）
teable sql-query -b bseb5kz1csAGvxx3I0N --sql \
'SELECT "Ren_Wu_Bian_Hao","Ren_Wu_Biao_Ti","Zhuang_Tai","Fu_Ze_Ren","GrokJiu_Xu","You_Xian_Ji"
 FROM "bseb5kz1csAGvxx3I0N"."tblaDw7ZIclyAaeF1ik" ORDER BY "Ren_Wu_Bian_Hao"'

# 单条全文（领取后）
teable record get -b bseb5kz1csAGvxx3I0N --table-id tblaDw7ZIclyAaeF1ik --record-id <recXXX> --pretty
```

---

## 硬禁止

- 自行标完成  
- 同时 >1 条 Grok 在途  
- commit/push（除非任务正文要求）  
- 改 prototypes/ 仓库根 docs/ assets（除非允许）  
- 开放后续任务编号  
- 编造测试结果  

---

## 视图索引（开发任务）

| 视图 | ID | 角色 |
|------|-----|------|
| 全部任务 | `viwIXfiAOxWM8fbTnu7` | 总览 |
| **Grok 可领取** | `viwI2hZLRxiVMj5rriQ` | **领任务** |
| 开发看板 | `viwcqjc0tqTAIJFFLpR` | kanban |
| 阻塞任务 | `viwGhuQcutIn7zWb5Ip` | 阻塞 |
| 验收队列 | `viwLpJM67Nniky5Fbxi` | Codex 侧 |
