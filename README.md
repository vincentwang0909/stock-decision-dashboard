# Stock Decision Dashboard

共享股票清单，完整 Technical / Market 数据，以及独立 **Daily / Weekly** 决策。
当前内部引擎版本是 `V2`；界面不显示版本号。原 Short/Mid/Long、1H/4H和旧模型
已移除。Company Profile 的 `2.1` 是独立画像格式，继续保留。

[当前模型、参数和验收](docs/daily-weekly-engine-proposal-2026-10-12.md) ·
[开发约束](AGENTS.md) · [历史记录操作](历史记录/README-历史记录.md)

## 本地运行

同源应用，从本地服务访问，不能双击HTML。

```bash
cd "/Users/vincentwang/Documents/Stock Dashboard Project"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 server.py
```

打开 `http://127.0.0.1:4173/`。Node 必须可用；不在PATH时设置
`EOD_DECISION_NODE_PATH`为其实际可执行路径，供共享画像分类/序列化使用。
不要把密码或密钥写入源码。缓存和SQLite不提交Git。

## 使用与数据

- Daily使用完成日线，Weekly使用交易所实际完整周；盘中只更新正常交易报价、执行位置和风险。无固定“30天”持有期限。
- 盘中Daily继续使用上一交易日的完成信号；Weekly独立使用上一完整周，不被本周尚未完成／缺失的日线连带阻断。各自必要完成周期缺失仍等待。
- Yahoo长历史缺少最新已收盘日线时，有界补取真实单日日线并校验完整OHLCV；不会拿Quote补造Close。等待提示区分日线／周线缺失、必要数据不足和有效区间未成立，并显示具体原因。
- Daily信号可在盘后/下一交易日使用，但成交前应核对当时价格仍在合格区间、收益风险比和风险边界；跳空或重大事件能让昨日Buy变成Hold。Weekly在该周最后实际交易日收盘确认。
- 七个Action：Strong Buy、Buy、Accumulate、Hold、Trim、Sell、Short Sell。Buy须右侧确认；Accumulate/Trim允许更早的有证据变化。没有必须逐级变化的序列。
- Short Sell仅普通股票Daily，独立开空区/上方失效位。Sell不等于可以开空；不接持仓、不增加Cover。
- 普通非杠杆ETF采用同样左侧/右侧语义。杠杆ETF以Daily执行，Weekly只展示背景；首版无左侧预测底部加仓。
- Confidence是证据一致性与稳定性，不是上涨概率。所有进入有真实结构位置和初始1.5R/2R门槛；费用、滑点与借券成本未核验。
- 只用已完成Daily成交量。Weekly量由Daily合成；短周RVOL按实际交易日数归一化，OBV仍用真实总量。未完成日线量仅展示。
- 默认请求最多十年Daily；上市时间较短的证券允许缺长背景，但必要Weekly结构/EMA50等不足会明确等待。SPY/QQQ共用完整基准历史。
- 宏观接官方Fed/FRED日历及BLS实际发布。CPI/就业比较月度变化与连续背景；失业率升高不自动当利好。稳定免费FedWatch概率尚不可用，明确显示缺口。
- SMC：已知结构BOS/CHoCH、扫回Sweep和同结构Premium/Discount。FVG先影子观察，不改变Action/Confidence/区间。
- 股票四tag为元数据画像；Direction规则相同，tag只修饰确认、风险、衰竭、市场/事件和周线稳定性。不会改原始ATR。

Technical保持完整数据，辅助项在各自相关组内封顶，不逐个投票。
Fundamental、options、news独立数据不进入推荐；仍可按已有服务功能保留。

## 刷新、清单与存储

手动与自动刷新执行同一全量清单事务。浏览器和服务在
`America/New_York`的每小时05/15/25/35/45/55分刷新，DST安全；不是打开页面后每10分钟。
Last Refresh在全部数据、两周期计算、界面渲染和浏览器paint完成后提交，使用ET。
失败时保留上一成功页面/时间，下次定时继续。

当前清单唯一来源为共享`watchlist`表。空清单也有权威性；旧缓存、画像、
历史不能恢复已删除证券。Company Profile V2.1保存于同一数据库，完整画像
不随正常刷新改变；每年3月31日ET复核，稀疏数据不抹掉已知值。

本地默认 `data/watchlist.db`、`data/cache/`。Render优先使用持久盘：
`WATCHLIST_DB_PATH`、`MARKET_CACHE_DIR`。缓存默认放清单数据库旁，重启保留
数据来源但按现行源校验/模型重算。老三周期浏览器快照不再使用。

## Render与历史

`render.yaml`保持轻量单服务和持久盘配置，目标512MB RAM、0.5CPU、1GB磁盘。
不增加常驻行情/推荐历史或大型图表库。Node一次性序列化预算为旧生代128MB、
半空间4MB；它们不等于进程RSS/整个服务上限。

**历史保持暂停**：`EOD_HISTORY_ENABLED=false`，本次不自动开启、不部署。
未来启用后，服务16:30ET刷新并写每证券Daily/Weekly两行；旧Short/Mid/Long
内容/模型版本保持原样。正式历史不被Dashboard读取。

## 接口

- `GET /api/watchlist`，共享清单；原POST/DELETE路径保留。
- `GET /api/market-data?format=compact`，同源规范行情；`force=true&full_refresh=true`强制刷新请求清单。
- 既有 `/api/decision-v1` URL保留，序列化格式更新为 `decision.v2`，周期键`daily/weekly`，同一内部`V2`。用户确认无外部旧格式调用方。
- `/api/health`反映内部版本、资源和历史开关；版本不在Dashboard展示。

## 验证

```bash
python3 -m unittest discover -s tests -p '*_test.py'
```

逐个运行`node tests/*.test.js`文件（不把多个文件当一个Node入口）。
全部引擎/特征/API/EOD/刷新/语言测试使用同一生产模块；临时数据输出应放
项目外。真实数据审计入口：`scripts/indicator-audit-values.js`、
`verify-indicator-math.py`、`decision-audit.js`、`fibonacci-audit.js`、
`indicator-replay.js`；各工具不下载/启用生产历史，参数见脚本Usage。

本地公式、集成、资源检查通过仍不等于行情供应商全部原始值获得独立认证，
也不等于1.5R/2R、顶底预判或策略收益已得到效果证明。历史材料位于
`docs/final-model-2026-10-01/`，只证明原版本，复现使用其冻结源码。
