> 历史版本说明：本文保留原日期/结果。2026-10-12当前模型已改为独立Daily / Weekly、完成数据及V2门禁，见[现行V2](daily-weekly-engine-proposal-2026-10-12.md)。本文的旧三周期/分时/参数描述不再是生产规则。

# 已完成 Daily 成交量政策 · 2026-10-10

本地实现版本 `decision-engine-v2.4-daily-volume`，Technical 为 `technical-features-v7-completed-daily-volume`，指标接入版本 `structure-momentum-v2-daily-volume`。此版本尚未部署。本次用户授权仅调整成交量数据依赖，SPCX 价格不作修正；SMC、宏观规则、公司 tag、新做空 Action 和 Price Landscape 改版继续讨论。

## 使用规则

| 数据 | 决策用途 |
| --- | --- |
| 原生 1H／4H OHLC | 保留原有价格指标、确认结构与 Short 主辅周期 |
| 1H／4H 成交量 | 不参与 OBV、参与度或结构放量确认；原始接口量及冲突诊断保留 |
| 已完成 Daily 成交量 | 共享 Volume、RVOL、均量、换手率；Short／Mid OBV 背景 |
| 未完成 Daily 累计量 | 仅展示，并标明日期；不进入 RVOL、OBV、量趋势、量冲击判断 |
| 完成周线量 | 从已完成 Daily 合成，仅供 Long 的 Weekly OBV／结构量背景 |

Short OBV 的趋势窗口为 **5 个完成交易日**，Mid 为 **20 个完成交易日**，Long 为 **12 根完成周线**。OBV 累积值仍使用有效加载历史；趋势窗口不是截断累积值的起点。Short 与 Mid 复用 canonical Daily OBV 子视图，不重复计算或伪称 4H OBV。窗口和允许使用量的结构周期统一在 `config.indicators.volume`。

Daily 必须有明确 `completed=true`、有效收盘结束时间，且结束时间不晚于计算时点。缺少完成信息、Daily 行被拒绝或已消费 Daily 量冲突时量依据不可用；不足所需 horizon OBV 窗口也产生等待 Hold，并保留 Confidence 上限、空计划和稳定性保护。未消费的分时量或当日未完成量冲突不再触发这个保护。Daily 缺失行不会被静默跨过以制造连续 OBV。

缺失／负数分时量不会删除其有效 OHLC 价格行，也不会被填零。分时量不可用不能因此改变 MA、MACD、RSI、ATR 或价格事件。Weekly 合成保留每周最终 Daily 结束时间并传播量冲突标记，不能把周一结束时间作为整周结束时间。

结构事件的价格突破、回踩和失败检测继续使用原有确认规则。1H／4H `volume_oscillator`、`volume_confirmed` 为不可用，`volume_source=not_applicable`；Daily／完成 Weekly 保留来自日线的原有量 EMA 规则。分时突破不再仅凭量获得 qualified，但价格回踩仍可完成资格确认。`structureLevelsEnabled=false` 未开启，结构事件仍以原有小权重进入确认。

Dashboard 中英显示已完成日线量日期、当日未完成累计量和 OBV 实际周期。决策理由明确为 Daily 背景，不声称当天分时放量。最新 Quote 和价格状态继续决定当前可执行位置；有合格历史量背景时无需等待今天收盘才能判断。昨日量背景不能单独产生 Buy。

所有既有 Direction／Confirmation 权重、入场／防御 Sell 门槛、Profile／Market 政策、区间计算和保留 gate 均未调整。成交量依据更换会影响 Confirmation、Risk 或 Action，这属于本次授权范围；并非收益改善结论。API wire contract 仍为 `decision.v1`；Dashboard、API、EOD 使用同一配置版本。历史记录未启动，也未改写旧行。

## 本地验证

- 15 个 JavaScript 测试脚本全部通过，覆盖 Technical、stock／ETF engine、显示翻译、API、EOD 序列化和刷新规则。
- Python 共 92 个测试：91 通过、1 跳过。覆盖此前分时缓存冲突全量补取的真实种子恢复检查、服务与历史原子写入规则；测试历史数据库仅在临时目录。
- 新增 `tests/daily-volume-policy.test.js`：缺失／负数／极大分时量、未完成 Daily 量变化不改变三个 horizon 的 canonical 特征及最终决策（仅排除运行时生成时间）；覆盖普通股票、普通 ETF、杠杆及反向 ETF。
- 同一测试验证 Daily 冲突等待、缺少完成元数据、缺失 Daily 行、所需 OBV 窗口不足、未来结束时间不能提前使用，以及收盘后 Daily／Weekly 量及结束时间更新。
- Dashboard 翻译检查验证 Short 显示日线 OBV、已完成量日期、当前累计量的展示限制，并保留 canonical 数据不被语言切换修改。

按保存的当前 watchlist 核验 **29 个证券 × 3 个 horizon = 87 个结果**，复用保存的 Daily／原生 1H／4H 行情和同一 Market／Profile 输入，先执行现行分时量对照。29 个证券的完成 Daily 量及所需 OBV 均可用。旧版 14 个 Short 的量冲突等待保护在新依赖下解除；Direction 分值全部一致，Mid／Long Action 全部一致。5 个 Short Action 改变：MPT Hold→Sell；NOW、SPCX、TQQQ、QQQ Hold→Accumulate。这是冻结快照差异，不能作为当前交易建议或胜率证据。

完整本地复核材料保留在 `/private/tmp/dashboard-volume-20261010/`：`daily-volume-validation.ipynb` 的两个 Python 代码单元已用标准库顺序执行并保存输出、检查结构；环境未提供 Jupyter 内核或 nbformat，因此没有进行 Jupyter 内核执行验证；`daily-volume-shadow.js`、`daily-volume-shadow-input.json`、`baseline-source/`、`current-source/` 为冻结复现材料；`daily-volume-shadow.json`、`daily-volume-tests.json` 和 `python-tests-daily-volume.log` 为结果。不进入生产或 Git。

## 边界

切换 Daily 消除了已识别的分时量依赖，不代表 Yahoo Daily 获得了交易所“最终审计保证”，也没有确定原始矛盾是 ECN 重复计数。收盘完成与数据商不再修订是不同概念。数据可信度提高不等于上涨／期权盈利概率提高；此轮没有未来收益回测或盘后执行验证。
