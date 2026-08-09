# The Living Ledger — PROTOTYPE ONLY

这是一个可丢弃的语义锚定 PoC，只回答一个问题：一本书能否从一条可激活的 Smith 阅读路径生长出一个可运行世界，而不是与游戏窗口并排摆放。

## 启动

在仓库根目录运行一条命令：

```bash
cd prototypes && python3 -m http.server 4176
```

然后打开：

```text
http://127.0.0.1:4176/living-ledger-shell/
```

## 演示路径

1. 阅读态显示三个 source blocks，依次点击 `smith.b1.c1.division`、`smith.b1.c3.market_extent`、`smith.b1.c2.exchange`。
2. 观察页边 `ACTIVE NODE IDS` 和 typed edges：`constrained_by` 先出现，第三个节点后加入 `exchange_rule`。
3. 在 Experiment Slip 留下预测，点击“运行这组关系”；进入世界态后点击 Godot 画布中的“开始演示”，再点击画布可推进场景。
4. 点击“收回运行账本”，证据态会回写本次 source ids、typed edges、预测、因果账、Smith 原文和模型边界。

## URL 状态

- `?state=reader`：三个 Smith source blocks、active subgraph 与读者预测
- `?state=world`：纸面扩大为可运行的 Godot 世界
- `?state=evidence`：世界折回，显示因果账目、Smith 原文和模型边界

左右方向键也可以切换状态。

当前价格上限场景只是 `MODEL EXTENSION` 占位模型，不代表最终的《国富论》核心机制；source id 是稳定语义 id，不是页码。
