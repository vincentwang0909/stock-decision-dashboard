#!/usr/bin/env python3
"""Independent math from identical source observations; no market-price certification."""
import argparse,json,math,statistics
from pathlib import Path
from datetime import datetime,date,timedelta

def ema(v,n):
    out=[None]*len(v)
    if len(v)<n:return out
    x=sum(v[:n])/n;out[n-1]=x
    for i in range(n,len(v)):x+=(v[i]-x)*2/(n+1);out[i]=x
    return out

def wilder(v,n):
    if len(v)<n:return []
    x=sum(v[:n])/n;out=[x]
    for a in v[n:]:x=(x*(n-1)+a)/n;out.append(x)
    return out

def rsi(v,n):
    if len(v)<=n:return None
    ds=[b-a for a,b in zip(v,v[1:])];g=wilder([max(x,0) for x in ds],n)[-1];l=wilder([max(-x,0) for x in ds],n)[-1]
    return 50 if g==l==0 else 100 if l==0 else 100-100/(1+g/l)

def main():
    p=argparse.ArgumentParser();p.add_argument('quotes',type=Path);p.add_argument('node_values',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
    checks=[]
    def check(case,key,actual,expected):
        valid=actual is None and expected is None or isinstance(actual,(int,float)) and isinstance(expected,(int,float)) and math.isfinite(actual) and abs(actual-expected)<=max(1,abs(expected))*1e-9
        checks.append(dict(ticker=case['ticker'],interval=case['interval'],field=key,pass_=valid,actual=actual,expected=expected))
    cases=json.loads(a.node_values.read_text())
    for case in cases:
        raw=json.loads((a.quotes/(case['ticker']+'.json')).read_text());q=raw.get('quote',raw);h=q['history'];at=datetime.fromisoformat(case['asOf'].replace('Z','+00:00'))
        rows=[dict(zip(['t','o','h','l','c','v'],r)) for i,r in enumerate(zip(*[h[k] for k in ['timestamps','opens','highs','lows','closes','volumes']])) if h['completed'][i] and datetime.fromisoformat(h['bar_end_timestamps'][i].replace('Z','+00:00'))<=at]
        if case['interval']=='1w':
            calendar=h['session_calendar'];group={}
            for r in rows:
                day=date.fromisoformat(r['t'][:10]);k=(day-timedelta(days=day.weekday())).isoformat();group.setdefault(k,[]).append(r)
            rows=[dict(t=rs[-1]['t'],o=rs[0]['o'],h=max(r['h'] for r in rs),l=min(r['l'] for r in rs),c=rs[-1]['c'],v=sum(r['v'] for r in rs),sessions=len(rs)) for k,rs in group.items() if k in calendar['completed_week_keys'] and len(rs)==calendar['session_counts'][k] and datetime.fromisoformat(calendar['week_ends'][k].replace('Z','+00:00'))<=at]
        actual=case['values'];c=[r['c'] for r in rows];high=[r['h'] for r in rows];low=[r['l'] for r in rows];v=[r['v'] for r in rows]
        check(case,'bar_count',case['bars'],len(rows))
        for n in [10,20,50]:check(case,f'ema_{n}',actual[f'ema_{n}'],ema(c,n)[-1] if c else None)
        for n in [100,200]:check(case,f'sma_{n}',actual[f'sma_{n}'],sum(c[-n:])/n if len(c)>=n else None)
        for n in [6,14,21]:check(case,f'rsi_{n}',actual[f'rsi_{n}'],rsi(c,n))
        if len(c)<28:continue
        tr=[high[0]-low[0]]+[max(high[i]-low[i],abs(high[i]-c[i-1]),abs(low[i]-c[i-1])) for i in range(1,len(c))]
        atr=wilder(tr,14);check(case,'atr',actual['atr']['value'],atr[-1]);check(case,'atr_pct',actual['atr']['atr_pct'],atr[-1]/c[-1]*100)
        percentages=[x/price*100 for x,price in zip(atr,c[13:])]
        for n in [60,120,250]:check(case,f'atr_percentile_{n}',actual['atr'][f'atr_percentile_{n}'],sum(x<=percentages[-1] for x in percentages[-n:])/n*100 if len(percentages)>=n else None)
        fast,slow=ema(c,12),ema(c,26);macd=[x-y for x,y in zip(fast[25:],slow[25:])];signal=ema(macd,9);hist=[x-y if y is not None else None for x,y in zip(macd,signal)]
        for name,val in [('macd_line',macd[-1]),('signal_line',signal[-1]),('histogram',hist[-1])]:check(case,name,actual['macd'].get(name),val)
        for n in [1,3,5]:check(case,f'histogram_change_{n}',actual['macd'].get(f'histogram_change_{n}'),hist[-1]-hist[-1-n] if hist[-1-n] is not None else None)
        up=[max(high[i]-high[i-1],0) if high[i]-high[i-1]>low[i-1]-low[i] else 0 for i in range(1,len(c))];down=[max(low[i-1]-low[i],0) if low[i-1]-low[i]>high[i]-high[i-1] else 0 for i in range(1,len(c))]
        smtr,smup,smdown=[wilder(x,14) for x in [tr[1:],up,down]];plus=[100*x/y for x,y in zip(smup,smtr)];minus=[100*x/y for x,y in zip(smdown,smtr)];dx=[100*abs(x-y)/(x+y) if x+y else 0 for x,y in zip(plus,minus)]
        for name,val in [('adx',wilder(dx,14)[-1]),('plus_di',plus[-1]),('minus_di',minus[-1])]:check(case,name,actual['adx'].get(name),val)
        middle=sum(c[-20:])/20;sd=statistics.pstdev(c[-20:]);check(case,'bb_middle',actual['bollinger']['middle_band'],middle);check(case,'bb_upper',actual['bollinger']['upper_band'],middle+2*sd);check(case,'bb_lower',actual['bollinger']['lower_band'],middle-2*sd)
        k=d=50
        for i in range(8,len(c)):
            hi,lo=max(high[i-8:i+1]),min(low[i-8:i+1]);rsv=(c[i]-lo)/(hi-lo)*100 if hi>lo else 50;k=(2*k+rsv)/3;d=(2*d+k)/3
        for name,val in [('k',k),('d',d),('j',3*k-2*d)]:check(case,'kdj_'+name,actual['kdj'].get(name),val)
        check(case,'obv',actual['obv'].get('raw_value'),sum(v[i] if c[i]>c[i-1] else -v[i] if c[i]<c[i-1] else 0 for i in range(1,len(c))))
        suffix='w' if case['interval']=='1w' else 'd';norm=[r['v']/r['sessions'] for r in rows] if suffix=='w' else v
        for n in [5,20,60,120,250]:check(case,f'volume_avg_{n}',actual['volume']['moving_average_volume'][f'avg_{n}{suffix}'],sum(v[-n:])/n if len(v)>=n else None)
        for n in [5,20,60]:check(case,f'rvol_{n}',actual['volume']['relative_volume'][f'rvol_{n}{suffix}'],norm[-1]/(sum(norm[-n:])/n) if len(norm)>=n and sum(norm[-n:]) else None)
        fib=actual['fibonacci'];lo,hi=fib.get('swing_low'),fib.get('swing_high')
        if lo is not None and hi is not None:
            span=hi-lo;up=fib['swing_direction']=='up_swing'
            for key,item in fib['retracement_levels'].items():r=float(key)/100;check(case,'fib_retrace_'+key,item['price'],hi-span*r if up else lo+span*r)
            for key,item in fib['extension_levels'].items():r=float(key)/100;check(case,'fib_extension_'+key,item['price'],lo+span*r if up else hi-span*r)
    failures=[x for x in checks if not x['pass_']];result={'cases':len(cases),'checks':len(checks),'all_passed':not failures,'failures':failures,'meaning':__doc__,'checks_detail':checks};a.output.write_text(json.dumps(result));print(json.dumps({k:result[k] for k in ['cases','checks','all_passed','failures']}));return bool(failures)
if __name__=='__main__':raise SystemExit(main())
