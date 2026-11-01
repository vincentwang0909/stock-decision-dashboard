#!/usr/bin/env python3
"""Export offline EOD Decision History without involving the Dashboard."""
from __future__ import annotations

import argparse
import csv
import json
import hashlib
import io
import os
import sqlite3
import tempfile
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

from 历史记录数据库 import export_rows, resolve_db_path


def export_bundle(source, output, date_from=None, date_to=None):
    """Stream both tables from one read-only SQLite snapshot; publish atomically."""
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_file():
        raise FileNotFoundError(f"历史库不存在：{source}")
    if output in {source, Path(str(source) + '-wal'), Path(str(source) + '-shm')}:
        raise ValueError("导出路径不能覆盖历史库或其附属文件")
    clauses, values = [], []
    for operator, value in ((">=", date_from), ("<=", date_to)):
        if value:
            clauses.append(f"market_date {operator} ?")
            values.append(value)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    output.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    temporary = None
    try:
        conn.execute("PRAGMA query_only=ON")
        conn.execute("BEGIN")
        with tempfile.NamedTemporaryFile(dir=output.parent, suffix=".zip.tmp", delete=False) as tmp:
            temporary = Path(tmp.name)
        files = {}
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
            for table, name, order in (
                ("decision_history", "stock-history.csv", "market_date,ticker,horizon"),
                ("eod_runs", "eod-runs.jsonl", "market_date"),
            ):
                cursor = conn.execute(f"SELECT * FROM {table}{where} ORDER BY {order}", values)
                count, first, last = 0, None, None
                with archive.open(name, "w", force_zip64=True) as raw:
                    with io.TextIOWrapper(raw, encoding="utf-8", newline="") as stream:
                        if table == "decision_history":
                            writer = csv.DictWriter(stream, fieldnames=[col[0] for col in cursor.description])
                            writer.writeheader()
                        for row in cursor:
                            item = dict(row)
                            if table == "decision_history":
                                writer.writerow(item)
                            else:
                                # Preserve database values, including legacy null context.
                                stream.write(json.dumps(item, ensure_ascii=False, allow_nan=False) + "\n")
                            count += 1
                            first = first or item["market_date"]
                            last = item["market_date"]
                digest = hashlib.sha256()
                with archive.open(name) as stream:
                    for block in iter(lambda: stream.read(65536), b""):
                        digest.update(block)
                files[name] = {"rows": count, "first_market_date": first, "last_market_date": last,
                               "bytes": archive.getinfo(name).file_size, "sha256": digest.hexdigest()}
            manifest = {"schema": "history-export.v1", "exported_at_utc": datetime.now(timezone.utc).isoformat(),
                        "requested_range": {"from": date_from, "to": date_to},
                        "snapshot": "single read-only SQLite transaction; no refresh or migration",
                        "json_columns": "*_json fields retain their SQLite JSON strings; null stays null",
                        "files": files}
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        conn.rollback()
        os.replace(temporary, output)
        return manifest
    finally:
        conn.close()
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main() -> int:
    parser = argparse.ArgumentParser(description="导出每日盘后 Decision History")
    parser.add_argument("--db", help="SQLite path; defaults to DECISION_HISTORY_DB_PATH / Render disk / local fallback")
    parser.add_argument("--from", dest="date_from", help="起始 market_date, YYYY-MM-DD")
    parser.add_argument("--to", dest="date_to", help="结束 market_date, YYYY-MM-DD")
    parser.add_argument("--format", choices=("zip", "csv", "json", "jsonl"), default="zip")
    parser.add_argument("--output", help="输出文件；默认 历史记录/导出/stock-history.zip")
    args = parser.parse_args()
    try:
        for value in (args.date_from, args.date_to):
            if value:
                date.fromisoformat(value)
        if args.date_from and args.date_to and args.date_from > args.date_to:
            raise ValueError("起始日期不得晚于结束日期")
    except ValueError as error:
        parser.error(str(error))
    if args.format == "zip":
        output = Path(args.output) if args.output else Path(__file__).resolve().parent / "导出" / "stock-history.zip"
        result = export_bundle(resolve_db_path(args.db), output, args.date_from, args.date_to)
        print(f"Exported {result['files']['stock-history.csv']['rows']} decisions and "
              f"{result['files']['eod-runs.jsonl']['rows']} runs to {output}")
        return 0
    rows = export_rows(args.db, args.date_from, args.date_to)
    output = Path(args.output) if args.output else Path(__file__).resolve().parent / "导出" / f"decision-history.{args.format}"
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.format == "json":
        output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    elif args.format == "jsonl":
        output.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
    else:
        fieldnames = list(rows[0].keys()) if rows else []
        with output.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            if fieldnames:
                writer.writeheader()
                writer.writerows(rows)
    print(f"Exported {len(rows)} rows from {resolve_db_path(args.db)} to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
