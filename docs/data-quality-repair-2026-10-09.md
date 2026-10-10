# Dashboard 数据修复与验证 · 2026-10-09 ET

本地候选版本：`decision-engine-v2.3-data-guarded`；Technical schema：`technical-features-v6-data-trust`。本次验证时 Render 仍运行提交 `2d1124b9b87b1eaeef7f76b61153c46cb8c7424d`。本地通过不代表已上线，也不代表供应商全部历史数据已获独立认证。

## 修复行为

- 日线时效以 XNYS 交易日历、实际收盘时间及 America/New_York 为依据。报价更新而日线滞后时明确等待；周末、假日、半日交易和 DST 不以自然日误判。重新读取缓存时重新核验时效。
- 1H／原生 4H 的旧缓存必须先完成新的全量种子验证，之后才允许经过重叠检查的增量续接。历史修订仍触发回补；不把重复增量数据或修订后的价格／成交量拼接到旧基准。
- 比较完整、连续、已完成的常规交易时段：1H／4H 的日内成交量总和超过同日 Daily 的 1.05 倍即标记跨端点冲突。该单边检查容许 Daily 包含更多竞价成交量，不能反过来要求两者相等。缺口、未完成、无时区或缺少结束时间的会话不算通过。
- 保留原始 OHLCV，不按比例修正成交量。只隔离明确冲突日期的量数据；累计 OBV 因历史基准受污染而不可用。结构事件的成交量 EMA 在下一个连续有效段重新预热；价格事件的首次可知时间不改变。当前保守策略下，主周期历史存在此类冲突会让该 horizon 等待，直到源数据解决；不让正常 Daily 的其他 horizon 自动跟随 Short 等待。
- 数据不足、过期、主周期成交量冲突或结构不足均显示 Hold／等待。生产不再生成 Avoid；不以无数据创建 Sell 或退出区间。Confidence 在最终等待结果之后上限 35，参数只定义于 config。历史记录及旧 wire 数据不改写。
- 标准与 compact 接口均采用有界序列化。标准接口的 quotes、data、items.analysis 从同一份冻结结果重放，保证时间和缓存年龄完全一致；临时文件在响应关闭或失败时释放。保留 API URL、`decision.v1` 格式与原始 Technical 字段。
- compact 流程保留服务端持久化画像，避免重新读取原始缓存时丢失已保存的公司分类。SPY／QQQ 风险背景按实际趋势描述；未知值明确不可用，不再一律显示横盘。
- Technical 页面显示最新 Daily／应有已完成交易日、量数据核验结果及获取时间；供应商未提供历史截止时间时明确“未提供”。等待 Action 明确标识数据／结构不足。静态模块版本同步更新以避免浏览器混用旧模块。

## 来源与核验范围

只取当时线上请求清单中的当前 29 只标的；不由历史记录、缓存残留或旧画像扩充 universe。读取来源为 [线上 Dashboard](https://stock-decision-dashboard.onrender.com) 的 compact／单标的标准接口、只读 Render 服务日志与指标，以及 Yahoo/yfinance 1.5.2 的行情历史。记录时间为 2026-10-10 UTC，等价于 2026-10-09 ET 晚间。

独立行情请求 87 组：29 × Daily 10y、1H 365d、原生 4H 365d，最大并发 2。全部返回非空有效 OHLCV，行级拒绝数为 0，全部 Daily 最新日为 2026-10-09。原生 4H 元数据为 4h。yfinance 的 `history_metadata` 在 Daily 调用后可另取 1H/5d 信息，因此本次审计中 Daily 的该元数据不能作为 Daily 原生时间截止证据；以实际返回 frame、请求参数和 session provenance 核验，不伪造 provider cutoff。

累计 19,489 个完整会话的跨周期检查发现 14 只标的有历史量数据冲突：NVDA、AMD、GOOGL、AMZN、MPT、MSFT、NFLX、NOW、SPCX、MU、ORCL、TQQQ、QQQ、UNH。此次重新获取的近期量数据与旧缓存的异常有改善，但这些旧日期的跨端点矛盾仍存在，不能宣布全历史正确，也不能断言 Daily 或 intraday 哪一端一定错。需要供应商修订或独立成交量来源，当前实现隔离并等待。

XE 仅有 117 根 Daily，SPCX 仅有 83 根；较长窗口不可用属于真实历史不足，禁止补造 250 日指标。读取的 NVDA 标准接口持久化画像已核实；其余 28 只线上持久化画像还需在上线后逐只轻量核验，本地分类测试不代替这一验收。

## 验证结果

| 检查 | 结果 | 适用范围 |
| --- | --- | --- |
| Python 回归 | 91 项，1 项环境相关跳过，其余通过 | server、日历、数据、接口、资源与隔离的历史记录测试 |
| JavaScript 回归 | 14 套通过 | Technical、各 horizon、不可用门禁、API、双语与刷新 |
| 独立公式复算 | 87 组、5,628 项全部通过，容差 relative 1e-9 / absolute floor 1e-9 | 同一组源 bars 的独立 Python 公式；不是独立行情真值认证 |
| 标准接口 | 29 quotes、29 items、兼容别名完全相等、HTTP 200 | 冻结样本，本地 Gunicorn；尚未上线验收 |
| 整服务峰值内存 | 540,770,304 → 266,223,616 bytes，约 516 → 254 MiB | 同 29 样本、macOS 模拟，同时包含服务进程及隔离的 Node 记录流程 |
| 标准接口峰值内存 | 441,483,264 → 174,473,216 bytes，约 421 → 166 MiB | 不是 Render cgroup；线上 512 MiB 条件需部署后实测 |
| 实际浏览器 | 桌面 1440×1000／手机 390×844，通过 | NVDA 过期等待、QQQ 量数据冲突、中英文、打开技术面、关闭弹窗、手动刷新；冻结 3 标的样本 |

浏览器验证使用 Playwright 1.62.1／隔离的 headless Chrome，原因 `Browser plugin not available`。页面身份、非空内容、无框架错误覆盖层、交互及截图均通过，无相关应用异常。已有 favicon.ico 404 为站点小图标缺失，不影响数据、计算或交互；保留该证据。没有验证所有设备或线上新版本。

原始行情、完整字段清单、公式逐项结果、内存采样、截图及可检查 notebook 都在外部临时目录 `/private/tmp/dashboard-fix-20261009/`，不写入 Git 或生产历史。核心证据：`full-provider-audit.json`、`full-reconciliation.json`、`independent-math.json`、`memory-before.json`、`memory-after-frozen.json`、`browser-qa.json`、`data-quality-receipt.ipynb`。测试及模拟使用独立临时数据库，生产 EOD 继续停止。

## 下一批设计边界

用户已接受：普通股票右侧为主、早期转强可分批；风险／回撤优先；公司 tag 结合实际 ATR 及有界修饰可影响 Action；确认结构转空或重要结构失效才 Sell，单个指标或一次 CHoCH 先 Hold。QQQ／SPMO 的 Long 左侧也允许 Buy，Strong Buy 仍要求严格右侧确认；杠杆及反向 ETF 必须更严格确认。SOXL 为做多半导体的杠杆 ETF，SQQQ 为反向杠杆 ETF。以上是已确认的下一批设计意图，尚未作为新策略上线。

本次未新增 CHoCH／Sweep／FVG、未调整 Opportunity／Reduce 宽度与中心、未放开失败的 structureLevelsEnabled 门禁、未改 Short 固定 Direction／Confirmation 权重、未实现新的 Sell 或 ETF 左侧政策、未开启生产记录。下一步先在已验证输入上确定结构因果定义、回撤与延续两类可执行 Opportunity、ATR 风险空间和独立 horizon 规则，再验证和修改策略。
