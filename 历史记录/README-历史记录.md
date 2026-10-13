# Daily / Weekly 离线 Decision History

**当前暂停（2026-10-12）**：默认及Render Blueprint均为
`EOD_HISTORY_ENABLED=false`。本次测试仅使用临时数据库；没有开启正式记录。
未来需在用户明确安排重启记录后启用。

## 同一生产计算与完整事务

Render Web Service在16:30 `America/New_York`执行：全watchlist实时刷新→
共享canonical Technical/V2引擎→每证券Daily/Weekly两行→单次SQLite事务。
Weekly保留最近完成周的signal_as_of，周中不会假造当周确认。

对应数据必须有当天完成Daily交易日，周末/交易所假日跳过；单证券旧数据
写显式unavailable，不把昨日结果复制成今日记录。重复同日运行UPSERT，
唯一键`market_date+ticker+horizon`；失败回滚全部成功行。

历史数据库不进入正常Dashboard请求、Action或Confidence，也不预加载到
常驻内存。Node采用逐ticker临时manifest/有界128MB旧生代和4MB半空间，
两周期共享一次规范化，写后退出并清理临时文件。全刷新/画像分类/序列化
共用服务临界区，不在残留无界任务旁叠加进程。

## 数据与兼容

新记录使用内部`V2`、特征schema`V2-daily-weekly`和`daily/weekly`。
旧Short/Mid/Long（包括旧Avoid）每个字段原样保留；数据库约束迁移仅允许
新周期键，复制旧行不改内容。旧Short宽度shadow列留作历史兼容，新行不再
执行旧宽度模型。已有数据库不在本次验收中写入/迁移。

紧凑行包含最终Action/Confidence、价格区间/失效、signal/quote时间、数据
状态/缺口、Direction/Confirmation/Risk/Exhaustion、Market与公司/ETF
画像、有界canonical特征与SMC可知时间、final reason、独立短空计划/上方
失效和backgroundOnly。原始OHLCV数组/完整series不保存；FVG无决策贡献。

## 存储与启用后的运行

`DECISION_HISTORY_DB_PATH`优先；否则Render可写`/var/data/历史记录.sqlite`，
本地fallback`历史记录/历史记录.sqlite`。数据库/导出均忽略Git。
`eod_runs`保存日期、开始/完成、行数、错误摘要和数据库大小，无无限缓存。

手动入口`python3 历史记录/历史记录.py --run-now`仍会刷新并写真实历史，
不是只读检查；当前暂停期间不运行它。`EOD_DECISION_NODE_PATH`必须指向
Node。未来恢复记录前检查日线日期、完整清单、原子提交与持久盘空间。

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

删除这项功能不会改变当前 Dashboard、Technical / Market 页面或任何期限的生产 Decision Engine 计算结果。删除环境变量时也移除两个 EOD Node 堆预算变量；当前资源验证见 [V2验收](../docs/daily-weekly-engine-proposal-2026-10-12.md)；旧版资源报告保留其历史含义。
