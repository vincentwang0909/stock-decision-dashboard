# Daily / Weekly 离线 Decision History

**2026-10-18 更新**：代码默认及Render Blueprint仍为`EOD_HISTORY_ENABLED=false`。
用户已安排恢复记录；先部署并核验新版，再在Render面板启用。本地测试仅使用
临时数据库，不开启正式记录。不做电脑同步、自动删历史或参数自动优化。

## 同一生产计算与完整事务

Render Web Service在交易日23:00 `America/New_York`执行：全watchlist实时刷新→
共享canonical Technical/V2引擎→每证券Daily/Weekly两行→单次SQLite事务。
Weekly保留最近完成周的signal_as_of，周中不会假造当周确认。

使用IANA时区处理DST，不使用固定UTC偏移。周末/交易所假日跳过；当天完全
没有有效完成Daily时失败，不把昨日结果复制成今日记录；单证券缺失写明确
unavailable。当缺失的是已完成周之外的一根Daily且当前Quote可信时，仅该Daily
记不可用，Weekly仍按自己的完整周证据记录；不从Daily借结构。失败最多3次、
间隔120秒，仅限同一ET日期；跨日不能补造昨晚记录。
首次成功批次固定，唯一键`market_date+ticker+horizon`。再次运行返回
already_recorded，不刷新/覆盖已有成功行；失败事务全部回滚。新增/移除仅按
当次共享watchlist处理，过程中清单改变则重试，不回写或删除旧历史。

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
失效和backgroundOnly。`technical_features_json.decision_explanation`保存实际
最终原因码、中英摘要、支持/限制理由、Direction/Confirmation/Risk/Exhaustion、
结构/区间、分组证据、市场门禁及实际画像修饰；没有另写判断逻辑或调用AI编解释。
每周期保存自己的FVG影子快照，含上下界、known_at、填充状态；结构/SMC保留
引擎当时持有的锚点、known_at、参考身份与状态。它不是全部历史/盘中事件档案，
不能从今天的活跃线推定过去全部可见线。原始OHLCV数组/完整series不保存；
单日OHLCV观察值保留，FVG不参与决策。Weekly周中重复快照不是独立周线样本。

`eod_runs.run_context_json`每日期仅一份，保存完整参数快照、配置/源码/输入
SHA256、可用部署commit、官方宏观实际值与日历。日历最多128条并明确截断标记。
源码指纹用于标识，不等于保存了全部可重放行情：供应商修订和新指标重算仍需
独立核验原始行情；禁止拿新版宏观或画像冒充过去已知信息。

## 存储与启用后的运行

`DECISION_HISTORY_DB_PATH`优先；否则Render可写`/var/data/历史记录.sqlite`，
本地fallback`历史记录/历史记录.sqlite`。数据库/导出均忽略Git。
`eod_runs`保存日期、开始/完成、行数、错误摘要和数据库大小，无无限缓存。
新增两列通过加列迁移，旧行内容保持；旧行新增信息为null，不补造依据。
`resource_metrics_json`及`eod_resources`日志包含：数据库前后字节/增量（含WAL/
SHM）、快照字节、部分可用数量、耗时、文件系统总/已用/剩余、worker前后及
采样峰值、cgroup前后及采样峰值/限制、Node自身进程峰值。采样峰值非逐瞬时峰值，
Node峰值非整个服务峰值，cgroup包含同服务其他工作；缺少OS接口时保持null。
SQLite检查点/页分配会影响单次增量，应结合多日趋势。资源采集是运行信息，
可在主事务后补记；采集失败不能把已提交决策改报失败。1GB与清单、画像、缓存
共享，不能只用历史文件体积推断剩余时间。先收集真实增长，不自动清理。

## 部署、启用与验收

1. 旧服务保持`false`，提交/推送新版并等待Render部署Live。
2. 打开`/api/health`：确认`eod_history.schema=eod-history.v2`、`time=23:00`、
   `timezone=America/New_York`、`node_available=true`，启用前enabled仍false。
3. Render服务→Environment→Edit：只把`EOD_HISTORY_ENABLED`改为`true`，
   选择Save and deploy。不要改其他变量；仅Save only不会立即生效。
4. 部署Live后核对health启用状态及下一运行时间；不需要浏览器/本机常开。
5. 首个交易日23:00后在Logs查看`database commit success`、证券数/两周期行数
   和`eod_resources`；在Shell用下列只读命令查看最近10次运行。

```bash
python3 历史记录/历史记录.py --status
```

该命令不导入server、不启动scheduler、不刷新、不写库。`[]`表示尚无运行。
常规Dashboard/health不打开历史数据库；health只提供当前进程的内存状态。
前10个交易日比较磁盘总占用、每日增长、成功/缺失数量及任务内存；再决定归档。
当前`render.yaml`保留false作为安全默认；未来执行Blueprint同步也可能恢复暂停，
同步后需再次核验面板/health实际启用状态。

手动入口`python3 历史记录/历史记录.py --run-now`在23:00后会刷新并写真实历史，
即使自动开关为false也不是只读检查；未计划写入时不要运行。`EOD_DECISION_NODE_PATH`
可指定Node，否则自动查找node。默认正式库位于持久盘，不把本机测试文件上传覆盖。

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
