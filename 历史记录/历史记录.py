#!/usr/bin/env python3
"""Manual development entry point for the server-side EOD recorder.

Run `python3 历史记录/历史记录.py --run-now` locally to exercise the same
full refresh, production JS Decision Engine, and SQLite writer used on Render.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

def main() -> int:
    parser = argparse.ArgumentParser(description="手动执行每日盘后 Decision History 记录")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--run-now", action="store_true", help="23:00 ET后运行一次；写正式历史，已成功日期不覆盖")
    group.add_argument("--status", action="store_true", help="只读查看最近10次运行、增长与内存，不启动记录或刷新")
    args = parser.parse_args()
    if args.status:
        from 历史记录数据库 import recent_runs
        print(json.dumps(recent_runs(), ensure_ascii=False, indent=2))
        return 0
    import server
    result = server.run_eod_history_once(reason="manual_dev_run")
    print(result)
    return 0 if result.get("status") in {"success", "already_recorded"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
