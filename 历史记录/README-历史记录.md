# 每日盘后 Decision History

这个目录保存**离线验证用途**的每日盘后 Recommendation Snapshot。它不进入 Dashboard 前端、不参与当前 Recommendation，也不会把历史数据库加载进 Render 的常驻内存。

## 运行方式

Render Web Service 内的后端调度器每天在 `America/New_York` 的 **4:30 PM ET** 运行。它先执行与生产刷新相同的全量 live refresh，再调用现有 JavaScript `technical-features.js` 和 `decision-engine/` 生成 Short / Mid / Long 的正式快照，最后用短 SQLite transaction 写入数据库。

周末会跳过。周一至周五也会检查最新 Daily market bar 是否属于当天交易日；交易所假日或没有任何有效当天数据时会记录 `eod_runs.status = skipped`，绝不会把前一天 cache 伪装成当天 EOD。当天个别 ticker 的 Daily bar 仍是前一天时，会写入明确的 `unavailable` 行，而不会保存过期 Recommendation。

本地手动模拟（不必等到 4:30）：

```bash
python3 历史记录/历史记录.py --run-now
```

这个命令仍会执行 full live refresh，并只在今天确实有有效交易 session 时写入。

## 数据库位置

优先级如下：

1. `DECISION_HISTORY_DB_PATH` 环境变量（生产建议显式设置）。
2. Render Persistent Disk 已挂载且可写时：`/var/data/历史记录.sqlite`。
3. 本地开发：`历史记录/历史记录.sqlite`。

Render 当前 `render.yaml` 的 Persistent Disk mount 是 `/var/data`。建议在 Render Environment 增加：

```text
DECISION_HISTORY_DB_PATH=/var/data/历史记录.sqlite
```

`render.yaml` 已把 `EOD_DECISION_NODE_PATH=node` 写入 Blueprint；Render native deployment 提供 Node 工具。仅在将来改用不含 Node 的运行环境时，才需要把它改成实际 Node binary 的绝对路径：

```text
EOD_DECISION_NODE_PATH=/path/to/node
```

Blueprint 现在固定 `EOD_HISTORY_NODE_MAX_OLD_SPACE_MB=128`、`EOD_HISTORY_NODE_MAX_SEMI_SPACE_MB=4`。这只是 V8 堆上限，**不是 Node RSS 或整个服务内存上限**。Python 3.12.14、Node 24.19.0 和依赖版本一并固定；实际 Render 尚未发布/验证。

全刷新、画像分类和 EOD/decision.v1 Node 子进程共享服务级临界区。EOD 等待尚未完成的有界网络任务退出；若无法在预算内排空，明确失败并等待重试，不与残留工作叠加启动 Node。16:30 后若已有同日、相同完整 watchlist 的合格全刷新，则共享这一代际，仍逐证券检查当日 Daily 数据。

交接使用临时 manifest 和逐 ticker 文件。Node 按需读取一个证券，三个期限共用一次 canonical features，必要 underlying 共用有界结果；输出逐行序列化，完成后退出并清理临时文件。Python 最后一次 SQLite 事务仍覆盖完整 watchlist × 三期限，不按输入批次分批提交。

记录器必须使用 Node，因为正式 Decision Engine 是现有 JavaScript 实现；它不会创建 Python 近似推荐逻辑。

## 保存内容

`decision_history` 的唯一键是：`market_date + ticker + horizon`。重复运行同一天任务会 UPSERT 覆盖同一条正式记录，不会重复累积。

每一条包含：

- Identity：交易日、ET 记录时间、ticker、stock/ETF、horizon、data status。
- Final Decision：Action、Confidence、Price State、Current Price。
- Price Landscape：Opportunity / Reduce 范围、Invalidation、Landscape quality。
- 当前真正用于决策的 Direction、Confirmation、Risk、Exhaustion。
- 紧凑 Market context、supporting / limiting reasons、material-change 状态。
- 紧凑 canonical technical feature snapshot：MA、RSI、MACD、ADX/DI、ATR、Bollinger、KDJ、OBV/RVOL、Relative Strength、Fibonacci provenance / selected structure、52W context。
- 一根当日 OHLCV/Quote 观测及其时间、币种、价格基础；模型/特征版本、缺失原因、最终动作对应的可信度构成。可选 ATR250 缺失不将有效当日证券降为整只 unavailable；核心证据不足的期限保留 partial/unavailable 与原因。
- Short 额外保存冻结的正常 Reduce ×0.995 baseline/candidate 精简对照；`shadow_only=true`，当前生产开关为关闭。这个对照仅供以后离线评价，不进入 Dashboard、不搜索参数、不改旧历史行。
- Stock 的 Primary Classification、Company Traits、Lifecycle、应用 modifiers，以及仅供离线分析的内部 `sizeClass`；或 ETF 的 leveraged、direction、underlying、ETF modifiers。`sizeClass` 不会成为 Company Trait 或 Dashboard UI 标签，旧历史行也不会被回写。

**不会**保存原始 OHLCV 数组、每根 1H/4H/Daily/Weekly bar、完整指标 series、目标价、旧 Action Score 或任何 Recommendation history cache。

`eod_runs` 只保存每个交易日一次轻量运行状态、记录行数、unavailable 数、错误摘要与数据库大小，便于检查是否漏跑。

## 查看最近运行

可以在 Render 服务日志搜索简洁日志：

```text
[EOD HISTORY] started 2026-08-18 16:30 ET
[EOD HISTORY] full refresh complete
[EOD HISTORY] 34 tickers / 102 horizon rows
[EOD HISTORY] 2 unavailable
[EOD HISTORY] database commit success
[EOD HISTORY] db size 3.4 MB
[EOD HISTORY] completed
```

失败或无有效当天交易数据也会留下 `eod_runs` 状态与简洁日志。

## 导出供离线分析

默认导出 CSV 到 `历史记录/导出/`：

```bash
python3 历史记录/导出历史记录.py
```

指定时间范围、格式和输出文件：

```bash
python3 历史记录/导出历史记录.py \
  --from 2026-08-01 --to 2026-08-31 --format jsonl \
  --output 历史记录/导出/2026-08.jsonl
```

支持 `csv`、`json`、`jsonl`。导出脚本是离线工具；Dashboard 本身永远不会读取整个历史库。

## 如果以后不再需要此功能

1. 删除项目目录 `历史记录/`（数据库与导出文件不在 Git）。
2. 从 `server.py` 删除 EOD scheduler 启动、`run_eod_history_once` 及其 import。
3. 从 Render Environment 删除 `DECISION_HISTORY_DB_PATH` 和可选的 `EOD_DECISION_NODE_PATH`。
4. 从 Render Persistent Disk 删除 `/var/data/历史记录.sqlite` 及其 `-wal` / `-shm` 文件。
5. 删除 `AGENTS.md` 中的 EOD Decision History Contract。

删除这项功能不会改变当前 Dashboard、Technical / Market 页面或任何期限的生产 Decision Engine 计算结果。删除环境变量时也移除两个 EOD Node 堆预算变量；完整操作及当前资源限制见 [本次内存与运维说明](../docs/final-model-2026-10-01/内存与运维.md)。
