#!/usr/bin/env python3
"""Offline fixed-origin evaluation. Daily recorded prices are observations, not fills."""
import argparse
from collections import Counter, defaultdict
import csv
from datetime import date, timedelta
import json
import math
from pathlib import Path
import statistics
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from market_data_validation import exchange_calendar

BUY = {'strong_buy', 'buy', 'accumulate'}
REDUCE = {'trim', 'sell'}
VERSIONS = ['baseline', 'resourceAndValidation', 'current', 'candidate', 'reference']


def family(action):
    return 'buy' if action in BUY else 'reduce' if action in REDUCE else 'non_directional'


def auc(values):
    winners = [score for score, label in values if label == 'correct']
    losers = [score for score, label in values if label == 'incorrect']
    return sum((left > right) + 0.5 * (left == right) for left in winners for right in losers) / (len(winners) * len(losers)) if winners and losers else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('rows')
    parser.add_argument('output_dir')
    args = parser.parse_args()
    rows = [json.loads(line) for line in open(args.rows, encoding='utf8')]
    timelines = defaultdict(list)
    for row in rows:
        timelines[(row['ticker'], row['horizon'])].append(row)
    for values in timelines.values():
        values.sort(key=lambda row: row['date'])
    dates = sorted({row['date'] for row in rows})
    calendar = exchange_calendar(2026)
    last = date.fromisoformat(dates[-1])
    path_cache = {}

    def path(row):
        key=(row['ticker'],row['horizon'],row['date'])
        if key in path_cache:return path_cache[key]
        origin = date.fromisoformat(row['date'])
        if row['horizon']=='short':deadline=origin+timedelta(days=30)
        elif row['horizon']=='mid':
            import calendar as civil_calendar
            month=origin.month%12+1;year=origin.year+(origin.month==12)
            deadline=date(year,month,min(origin.day,civil_calendar.monthrange(year,month)[1]))
        else:deadline=origin+timedelta(days=184) # Every supplied Long origin is immature.
        future = [value for value in timelines[(row['ticker'], row['horizon'])] if origin < date.fromisoformat(value['date']) <= deadline]
        if deadline > last:
            path_cache[key]=(future,'immature');return path_cache[key]
        expected = {stamp.date().isoformat() for stamp in calendar.sessions_in_range((origin + timedelta(days=1)).isoformat(), deadline.isoformat())}
        observed = {value['date'] for value in future if value['price'] and value['price'] > 0}
        path_cache[key]=(future,'complete' if expected <= observed else 'incomplete_path');return path_cache[key]

    def label(row, version, threshold=0.03, delayed=False):
        f = family(row[version]['action'])
        if f == 'non_directional':
            return 'non_directional'
        future, status = path(row)
        if status != 'complete':
            return status
        price = future[0]['price'] if delayed and future else row['price']
        for observation in future[1:] if delayed else future:
            change = observation['price'] / price - 1
            if change >= threshold:
                return 'correct' if f == 'buy' else 'incorrect'
            if change <= -threshold:
                return 'correct' if f == 'reduce' else 'incorrect'
        return 'unresolved'

    def early_resolved_label(row,version,threshold=0.03):
        """A first observed terminal threshold can resolve before day 30.

        Require every expected exchange session through that observation;
        without a hit, unresolved still requires the complete 30-day window.
        """
        f=family(row[version]['action'])
        if f=='non_directional':return f
        future,status=path(row);origin=date.fromisoformat(row['date']);seen=set()
        for observation in future:
            price=observation.get('price')
            if price is None or price<=0:continue
            seen.add(observation['date'])
            delta=price/row['price']-1
            if abs(delta)<threshold:continue
            expected={stamp.date().isoformat() for stamp in calendar.sessions_in_range((origin+timedelta(days=1)).isoformat(),observation['date'])}
            if not expected<=seen:return 'incomplete_path'
            return 'correct' if (delta>0)==(f=='buy') else 'incorrect'
        return 'unresolved' if status=='complete' else status

    groups = defaultdict(list)
    for row in rows:
        groups[(row['horizon'], row['assetType'].lower())].append(row)
    results = {}
    changed = []
    range_summary = {}
    confidence_summary = {}
    range_five_records = {}
    gate_failures = []
    for (horizon, asset), values in groups.items():
        key = f'{horizon}:{asset}'
        results[key] = {}
        for version in VERSIONS:
            selected = [r for r in values if r.get(version)]
            distribution = Counter(r[version]['action'] for r in selected)
            outcomes = {f: Counter(label(r, version) for r in selected if family(r[version]['action']) == f) for f in ['buy', 'reduce']}
            sensitivity = {str(threshold): Counter(label(r, version, threshold) for r in selected if family(r[version]['action']) != 'non_directional') for threshold in [0.02, 0.03, 0.05]}
            record_sensitivity = {}
            for n in [1, 3, 5, 10, 20]:
                counts = Counter()
                for r in selected:
                    f = family(r[version]['action'])
                    if f == 'non_directional':
                        continue
                    observations = path(r)[0]
                    if len(observations) < n:
                        counts['immature'] += 1
                    else:
                        delta = observations[n - 1]['price'] / r['price'] - 1
                        counts['unresolved' if delta == 0 else 'correct' if (delta > 0) == (f == 'buy') else 'incorrect'] += 1
                record_sensitivity[str(n)] = dict(counts)
            first_family = []
            prior = {}
            for r in sorted(selected, key=lambda r: (r['date'], r['ticker'])):
                f = family(r[version]['action'])
                if f != 'non_directional' and prior.get(r['ticker']) != f:
                    first_family.append(r)
                prior[r['ticker']] = f
            results[key][version] = {'historical_original_match_rows': sum(r.get('historicalOriginalMatch') is True for r in selected), 'original_consistent_subset': {f: dict(Counter(label(r,version) for r in selected if r.get('historicalOriginalMatch') is True and family(r[version]['action'])==f)) for f in ['buy','reduce']} if horizon=='short' else None, 'rows': len(selected), 'actions': dict(distribution), 'directional_coverage': sum(distribution[a] for a in BUY | REDUCE) / len(selected) if selected else None,
                'observed_30_calendar_days_first_3pct': {f: dict(counts) for f, counts in outcomes.items()} if horizon == 'short' else None,
                'short_threshold_sensitivity': sensitivity if horizon == 'short' else None, 'short_record_sensitivity': record_sensitivity if horizon == 'short' else None,
                'short_next_observation_execution': dict(Counter(label(r, version, delayed=True) for r in selected if family(r[version]['action']) != 'non_directional')) if horizon == 'short' else None,
                'short_first_consecutive_family_only': dict(Counter(label(r, version) for r in first_family)) if horizon == 'short' else None,
                'by_origin_date': {d: dict(Counter(label(r, version) for r in selected if r['date'] == d and family(r[version]['action']) != 'non_directional')) for d in dates} if horizon == 'short' else None,
                'by_ticker': {t: dict(Counter(label(r, version) for r in selected if r['ticker'] == t and family(r[version]['action']) != 'non_directional')) for t in sorted({r['ticker'] for r in selected})} if horizon == 'short' else None}
            if horizon=='short':
                directional=[r for r in selected if family(r[version]['action'])!='non_directional']
                mature=[r for r in directional if label(r,version) in ['correct','incorrect','unresolved']]
                results[key][version]['endpoint_before_shared_cutoff']={cutoff:{'origin_dates':sorted({r['date'] for r in mature if date.fromisoformat(r['date'])+timedelta(days=30)<date.fromisoformat(cutoff)}),'outcomes':dict(Counter(label(r,version) for r in mature if date.fromisoformat(r['date'])+timedelta(days=30)<date.fromisoformat(cutoff)))} for cutoff in ['2026-09-18','2026-09-26']}
                results[key][version]['leave_one_origin_date_out']={d:dict(Counter(label(r,version) for r in mature if r['date']!=d)) for d in sorted({r['date'] for r in mature})}
                results[key][version]['leave_one_ticker_out']={t:dict(Counter(label(r,version) for r in mature if r['ticker']!=t)) for t in sorted({r['ticker'] for r in mature})}
                results[key][version]['first_observed_early_resolution_3pct']={f:dict(Counter(early_resolved_label(r,version) for r in selected if family(r[version]['action'])==f)) for f in ['buy','reduce']}
        same_actions = [r for r in values if r['current']['action'] == r['candidate']['action']]
        confidence_summary[key] = {}
        for version in ['current', 'candidate']:
            confidence_summary[key][version] = {}
            for f in ['buy', 'reduce']:
                scored = [(r[version]['confidence'], label(r, version)) for r in same_actions if family(r[version]['action']) == f and label(r, version) in ['correct', 'incorrect', 'unresolved']]
                top = sorted(scored, reverse=True)[:math.ceil(len(scored) / 4)]
                confidence_summary[key][version][f] = {'same_final_action_rows': len(scored), 'auc_correct_vs_incorrect': auc(scored) if horizon == 'short' else None, 'top_quartile': dict(Counter(l for _, l in top)) if horizon == 'short' else None, 'support_score_is_probability': False}
        # Freeze the intersection of complete origins with two valid normal plans.
        common = [r for r in values if path(r)[1] == 'complete' and r['atr'] and all(r[v]['landscape'].get('opportunityRange') and r[v]['landscape'].get('reduceRange') and r[v].get('mode') != 'defense' and r[v]['state'] != 'BREAKDOWN_ZONE' for v in ['current', 'candidate'])]
        range_summary[key] = {}
        for version in ['current', 'candidate']:
            summary = {'fixed_origins': len(common), 'defensive_origins_separate': sum(path(r)[1] == 'complete' and (r[version].get('mode') == 'defense' or r[version]['state'] == 'BREAKDOWN_ZONE') for r in values)}
            for side in ['opportunityRange', 'reduceRange']:
                widths, errors, covered, reaction = [], [], 0, Counter()
                for r in common:
                    band = r[version]['landscape'][side]
                    widths.append((band['high'] - band['low']) / r['atr'])
                    future = path(r)[0]
                    extreme = min(x['price'] for x in future) if side == 'opportunityRange' else max(x['price'] for x in future)
                    covered += band['low'] <= extreme <= band['high']
                    errors.append(max(band['low'] - extreme, extreme - band['high'], 0) / r['atr'])
                    first_touch = next((i for i, x in enumerate(future) if band['low'] <= x['price'] <= band['high']), None)
                    if first_touch is None:
                        reaction['untouched'] += 1
                    else:
                        entry = future[first_touch]['price']
                        response = 'unresolved'
                        for x in future[first_touch + 1:]:
                            delta = x['price'] / entry - 1
                            if abs(delta) >= 0.03:
                                response = 'favorable' if (delta > 0) == (side == 'opportunityRange') else 'adverse'
                                break
                        reaction[response] += 1
                summary[side] = {'mean_width_origin_atr': statistics.mean(widths) if widths else None, 'recorded_extreme_inside': covered, 'denominator': len(common), 'mean_distance_error_atr': statistics.mean(errors) if errors else None, 'first_observed_touch_response_3pct': dict(reaction)}
            range_summary[key][version] = summary if horizon == 'short' else {'status': 'no_full_horizon_mature_path', 'one_month_mid_evidence_only': horizon == 'mid'}
            if horizon == 'short' and version == 'candidate':
                for side in ['opportunityRange', 'reduceRange']:
                    before, after = range_summary[key]['current'][side], summary[side]
                    if after['recorded_extreme_inside'] < before['recorded_extreme_inside'] or after['first_observed_touch_response_3pct'].get('favorable', 0) < before['first_observed_touch_response_3pct'].get('favorable', 0):
                        gate_failures.append(f'{key}:{side}:coverage_or_favorable_reaction_lost')
    for r in rows:
        if r['current']['action'] != r['candidate']['action']:
            gate_failures.append(f'{r["date"]}:{r["ticker"]}:{r["horizon"]}:action_changed')
        validation = r.get('resourceAndValidation')
        change_fields=[field for field in ['action','confidence','state','landscape','direction','confirmation','risk','exhaustion'] if r['baseline'].get(field)!=validation.get(field)] if validation else []
        changed.append({'date': r['date'], 'ticker': r['ticker'], 'horizon': r['horizon'], 'asset': r['assetType'], 'historical_original_match':r.get('historicalOriginalMatch'), 'baseline_action': r['baseline']['action'], 'resource_validation_action':validation.get('action') if validation else None, 'current_action': r['current']['action'], 'candidate_action': r['candidate']['action'], 'action_changed_width': r['current']['action'] != r['candidate']['action'], 'state_changed_width': r['current']['state'] != r['candidate']['state'], 'range_changed_width': r['current']['landscape'] != r['candidate']['landscape'], 'confidence_changed_width': r['current']['confidence'] != r['candidate']['confidence'], 'validation_range_changed': r['baseline']['landscape'] != validation['landscape'] if validation else None, 'validation_changed_fields':','.join(change_fields), 'validation_baseline_risk':r['baseline'].get('risk'), 'validation_current_risk':validation.get('risk') if validation else None, 'path_change_reason':'stock_short_policy_in_unified_v2' if r['horizon']=='short' and r['assetType'].lower()=='stock' else 'retained_horizon_policy_in_unified_v2', 'current_limiting_reasons':','.join(x.get('code','') if isinstance(x,dict) else str(x) for x in r['current'].get('reasons',{}).get('limiting',[])), 'stored_action': r['stored']['action'], 'reference_action': r['reference']['action'] if r.get('reference') else None})
    for asset in sorted({r['assetType'].lower() for r in rows}):
        counts, lost = Counter(), []
        for r in rows:
            if r['horizon'] != 'short' or r['assetType'].lower() != asset or r['current']['state'] in ['BREAKDOWN_ZONE', 'INVALID_LANDSCAPE']:
                continue
            future = path(r)[0][:5]
            if len(future) < 5 or not all(r[v]['landscape'].get('opportunityRange') and r[v]['landscape'].get('reduceRange') for v in ['current', 'candidate']):
                continue
            counts['origins'] += 1
            for side in ['opportunityRange', 'reduceRange']:
                extreme = min(x['price'] for x in future) if side == 'opportunityRange' else max(x['price'] for x in future)
                coverage = {}
                for version in ['current', 'candidate']:
                    band = r[version]['landscape'][side]
                    coverage[version] = band['low'] <= extreme <= band['high']
                    counts[f'{version}:{side}'] += coverage[version]
                if coverage['current'] and not coverage['candidate']:
                    lost.append({'date': r['date'], 'ticker': r['ticker'], 'side': side, 'recorded_extreme': extreme, 'baseline': r['current']['landscape'][side], 'candidate': r['candidate']['landscape'][side]})
                    gate_failures.append(f'short:{asset}:five_observation_coverage_lost:{r["date"]}:{r["ticker"]}')
        range_five_records[asset] = {'counts': dict(counts), 'lost_rows': lost}
    output_dir = Path(args.output_dir)
    with (output_dir / 'row-comparison.csv').open('w', newline='', encoding='utf8') as f:
        writer = csv.DictWriter(f, fieldnames=list(changed[0])); writer.writeheader(); writer.writerows(changed)
    summary = {'source_rows': len(rows), 'symbols': len({r['ticker'] for r in rows}), 'origin_dates': len(dates), 'first_date': dates[0], 'last_date': dates[-1], 'method': 'daily recorded-price first observed; full continuous 30-calendar-day path; unresolved included; no fill/fee/position assumptions',
               'versions': results, 'ranges': range_summary, 'confidence': confidence_summary, 'width_gate': {'factor': 0.995, 'passed': not gate_failures, 'failures': gate_failures, 'action_changes': sum(r['action_changed_width'] for r in changed), 'state_changes': sum(r['state_changed_width'] for r in changed), 'confidence_changes': sum(r['confidence_changed_width'] for r in changed)},
               'limits': ['Historical raw OHLCV absent: canonical-snapshot replay only.', 'Historical legacy profile slots are validated without guessing metadata.', 'Old reference 6/940 replay discrepancies remain a separate supplied-evidence subset; current V2.1 profiles/configuration need not reproduce it.', 'All tickers share origin-date cutoffs. No parameter search or new unseen test.', 'Mid minimum-one-month context does not validate a six-month horizon; Long has no >6-month mature results.']}
    summary['ranges_five_records'] = range_five_records
    (output_dir / 'replay-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf8')
    print(json.dumps({'width_gate': summary['width_gate'], 'rows': len(rows), 'output_dir': str(output_dir)}))


if __name__ == '__main__':
    main()
