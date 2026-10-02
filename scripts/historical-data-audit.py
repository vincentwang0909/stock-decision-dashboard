"""Offline checks of supplied snapshots; no fetches, mutations or future inputs."""
import csv, json, hashlib, math, sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / "docs/final-model-2026-10-01"
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/Users/vincentwang/Documents/decision-history-all.csv')
atr, kdj = {}, {}
keys, horizons, prices = Counter(), Counter(), defaultdict(dict)
issues, availability, source_counts = Counter(), Counter(), defaultdict(list)
identities = Counter()
sample_issues = []

def number(x):
    try:
        y = float(x)
        return y if math.isfinite(y) else None
    except (ValueError, TypeError):
        return None

def issue(kind, row, detail):
    issues[kind] += 1
    if len(sample_issues) < 15:
        sample_issues.append(dict(kind=kind, ticker=row['ticker'], date=row['market_date'], horizon=row['horizon'], detail=detail))

rows = 0
dates, symbols = set(), set()
with SOURCE.open(newline='', encoding='utf8') as f:
    for row in csv.DictReader(f):
        rows += 1
        h = row['horizon']
        horizons[h] += 1
        dates.add(row['market_date']); symbols.add(row['ticker'])
        keys[(row['market_date'], row['ticker'], h)] += 1
        p = number(row['current_price'])
        prices[(row['market_date'], row['ticker'])][h] = p
        if p is None or p <= 0: issue('invalid_current_price', row, p)
        for field, low, high in [('direction', -100, 100), ('exhaustion', -100, 100), ('confirmation', 0, 100), ('risk', 0, 100), ('confidence', 0, 100)]:
            value = number(row[field])
            if value is not None and not low <= value <= high:
                issue('state_out_of_range', row, field)
        for stem in ['opportunity', 'reduce']:
            low, high = number(row[stem+'_low']), number(row[stem+'_high'])
            if (low is None) != (high is None): issue('half_missing_range', row, stem)
            elif low is not None and (low <= 0 or high < low): issue('invalid_range', row, stem)
        try: feature = json.loads(row['technical_features_json'])
        except (ValueError, TypeError):
            issue('invalid_technical_json', row, 'parse failure'); continue
        availability[(h, feature.get('availability', 'missing'))] += 1
        for interval, meta in feature.get('source_intervals', {}).items():
            n = number(meta.get('bar_count'))
            if n is not None: source_counts[(h, interval)].append(n)
        for name, v in feature.get('volatility', {}).get('atr', {}).items():
            group = h+' / '+name
            g = atr.setdefault(group, {'records': 0, 'raw_available': 0, 'bar_counts': Counter(), 'windows': {str(w): Counter() for w in [60,120,250]}})
            g['records'] += 1
            g['raw_available'] += number(v.get('value')) is not None
            g['bar_counts'][v.get('available_bars')] += 1
            period = int(v.get('period') or 14)
            for w in [60,120,250]:
                c = g['windows'][str(w)]
                value = number(v.get('atr_percentile_'+str(w)))
                meta = v.get('atr_percentiles', {}).get('d'+str(w), {})
                c['available' if value is not None else 'missing'] += 1
                c['reason_'+str(meta.get('unavailable_reason'))] += value is None
                bars = number(v.get('available_bars'))
                if value is None and bars is not None and bars >= period+w-1: c['missing_despite_minimum_bar_count'] += 1
                if value is not None and not 0 <= value <= 100: issue('atr_percentile_out_of_range', row, name)
                if (meta.get('availability') == 'available') != (value is not None): c['metadata_contradiction'] += 1
        for name, v in feature.get('momentum', {}).get('kdj', {}).items():
            group = h+' / '+name
            g = kdj.setdefault(group, Counter())
            g['records'] += 1
            complete = all(number(v.get(key)) is not None for key in ['k', 'd', 'j'])
            g['numeric_available' if complete else 'numeric_missing'] += 1
            for flag in ['overbought','oversold']:
                value = v.get(flag)
                state = 'true' if value is True else 'false' if value is False else 'missing'
                g[flag+'_'+state] += 1
            if complete:
                identities['kdj_j_checked'] += 1
                if not math.isclose(number(v['j']), 3*number(v['k'])-2*number(v['d']), abs_tol=1e-9):
                    identities['kdj_j_failed'] += 1
                if v.get('overbought') is not (number(v['j']) >= 80): g['threshold_contradictions'] += 1
                if v.get('oversold') is not (number(v['j']) <= 20): g['threshold_contradictions'] += 1
                if number(v['j']) < 0 or number(v['j']) > 100: g['j_outside_0_100_valid'] += 1
        for v in feature.get('momentum', {}).get('macd', {}).values():
            a,b,c = [number(v.get(key)) for key in ['macd_line','signal_line','histogram']]
            if None not in (a,b,c):
                identities['macd_histogram_checked'] += 1
                if not math.isclose(a-b,c,abs_tol=1e-9): identities['macd_histogram_failed'] += 1

for g in atr.values():
    g['bar_counts'] = dict(sorted(g['bar_counts'].items(), key=lambda x: str(x[0])))
result = {
    'scope': 'supplied saved snapshots only; no independent raw OHLCV or live Render access',
    'input': {'file':'decision-history-all.csv','sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'bytes':SOURCE.stat().st_size},
    'rows':rows,'horizons':dict(horizons),'symbols':len(symbols),'dates':len(dates),'period':[min(dates),max(dates)],
    'duplicate_keys':sum(n-1 for n in keys.values()),
    'cross_horizon_price_mismatch':sum(len(set(v.values()))>1 for v in prices.values()),
    'issues':dict(issues),'sample_issues':sample_issues,
    'indicator_internal_identities':dict(identities),
    'feature_availability':{' / '.join(k):v for k,v in availability.items()},
    'source_bar_counts':{' / '.join(k):{'observations':len(v),'min':min(v),'max':max(v)} for k,v in source_counts.items()},
    'atr':atr,'kdj':{k:dict(v) for k,v in kdj.items()},
    'limitations':['Internal agreement does not establish provider accuracy.','Unavailable remains unavailable; no price or missing-bar imputation.','Rows across horizons and dates are dependent snapshots.'],
}
ROOT.mkdir(parents=True,exist_ok=True)
(ROOT/'history-data-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(result,ensure_ascii=False,indent=2))
