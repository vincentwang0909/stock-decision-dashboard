#!/usr/bin/env python3
"""Prepare offline point-in-time canonical snapshots; no future labels in inputs."""
import argparse
import csv
import hashlib
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('csv')
    parser.add_argument('output')
    parser.add_argument('--original-replay')
    args = parser.parse_args()
    original = { (r["date"], r["ticker"], r["horizon"]): r for r in json.loads(Path(args.original_replay).read_text()) } if args.original_replay else {}
    groups = {}
    with open(args.csv, encoding='utf8') as source:
        for row in csv.DictReader(source):
            key = row['market_date'], row['ticker']
            groups.setdefault(key, []).append(row)
    with open(args.output, 'w', encoding='utf8') as target:
        for (date, ticker), rows in sorted(groups.items()):
            first = rows[0]
            features = {'horizons': {}, 'fibonacci_structure': {}}
            for row in rows:
                feature = json.loads(row['technical_features_json'] or '{}')
                horizon = row['horizon']
                features['horizons'][{'short': 'short', 'mid': 'medium', 'long': 'long'}[horizon]] = feature
                features['fibonacci_structure'][{'short': 'short_term', 'mid': 'mid_term', 'long': 'long_term'}[horizon]] = feature.get('fibonacci') or {}
                features.update({key: feature.get(key) for key in ['schema_version', 'calculated_at', 'volume', 'price_position', 'source_intervals']})
            classification = {'isETF': first['asset_type'].lower() == 'etf', 'primaryClassification': first['primary_classification'] or None, 'lifecycle': first['lifecycle'] or None,
                              'companyTraits': json.loads(first['company_traits_json'] or '[]'), 'sizeClass': first.get('size_class') or None,
                              'leveraged': first['leveraged'].lower() in ['true', '1'], 'direction': first['etf_direction'] or 'long', 'underlying': first['underlying'] or None,
                              'profileSource': 'historical_canonical_snapshot', 'profileConfidence': 0.82}
            market = json.loads(first['market_context_json'] or '{}')
            metadata = {'daysToEarnings': market.get('earnings', {}).get('daysToEarnings'), 'earningsDate': market.get('earnings', {}).get('date'), 'asOf': first['recorded_at_et']}
            target.write(json.dumps({'date': date, 'ticker': ticker, 'assetType': first['asset_type'], 'historicalOriginalMatch': original.get((date,ticker,'short'), {}).get('action') == original.get((date,ticker,'short'), {}).get('old_action') if original else None, 'input': {'ticker': ticker, 'price': float(first['current_price']) if first['current_price'] else None, 'technicalFeatures': features, 'classification': classification, 'marketContext': market, 'metadata': metadata, 'language': 'en'}, 'stored': {r['horizon']: {key: r[key] for key in ['action', 'confidence', 'price_state', 'opportunity_low', 'opportunity_high', 'reduce_low', 'reduce_high', 'invalidation']} for r in rows}}, separators=(',', ':')) + '\n')
    print(json.dumps({'groups': len(groups), 'rows': sum(map(len, groups.values())), 'csv_sha256': hashlib.sha256(Path(args.csv).read_bytes()).hexdigest(), 'raw_ohlcv_available': False, 'output': args.output}))


if __name__ == '__main__':
    main()
