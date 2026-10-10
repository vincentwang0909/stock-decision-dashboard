#!/usr/bin/env python3
"""Independent Python formula checks against Node values on identical validated bars."""
import argparse
import json
import math
from pathlib import Path
import statistics


def ema(values, period):
    result = [None] * len(values)
    if len(values) < period:
        return result
    value = sum(values[:period]) / period
    result[period - 1] = value
    for i in range(period, len(values)):
        value = value + (values[i] - value) * 2 / (period + 1)
        result[i] = value
    return result


def rsi(values, period):
    deltas = [b-a for a,b in zip(values, values[1:])]
    gain = sum(max(x,0) for x in deltas[:period]) / period
    loss = sum(max(-x,0) for x in deltas[:period]) / period
    for delta in deltas[period:]:
        gain = (gain*(period-1)+max(delta,0))/period
        loss = (loss*(period-1)+max(-delta,0))/period
    return 100 if loss == 0 else 100-100/(1+gain/loss)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('quotes')
    parser.add_argument('node_values')
    parser.add_argument('output')
    args=parser.parse_args()
    cases=json.loads(Path(args.node_values).read_text())
    checks=[]
    def check(case,field,actual,expected):
        valid=(actual is None and expected is None) or (isinstance(actual,(float,int)) and isinstance(expected,(float,int)) and math.isfinite(actual) and math.isfinite(expected) and abs(actual-expected)<=max(1,abs(expected))*1e-9)
        checks.append({'ticker':case['ticker'],'interval':case['interval'],'field':field,'actual':actual,'expected':expected,'pass':valid})
    for case in cases:
        quote=json.loads((Path(args.quotes)/f'{case["ticker"]}.json').read_text())
        source=quote['history'] if case['interval']=='1d' else quote['history']['intervals'][case['interval']]
        c,h,l,v=(source[key] for key in ['closes','highs','lows','volumes'])
        actual=case['values']
        for p in [5,9,20,21,50,200]:check(case,f'ema_{p}',actual[f'ema_{p}'],ema(c,p)[-1])
        for p in [50,100,200]:check(case,f'sma_{p}',actual[f'sma_{p}'],sum(c[-p:])/p if len(c)>=p else None)
        for kind,periods in [('ema',[5,9,20,21,50,200]),('sma',[50,100,200])]:
            for p in periods:
                lag=min(5,max(1,p//4))
                series=ema(c,p) if kind=='ema' else [None if i+1<p else sum(c[i+1-p:i+1])/p for i in range(len(c))]
                expected=series[-1]-series[-1-lag] if series[-1-lag] is not None else None
                check(case,f'{kind}_{p}_slope',actual[f'{kind}_{p}_slope'],expected)
        if case['interval']=='1d':
            volume=actual['volume']
            for period in [5,20,60,120,250]:check(case,f'volume_mean_{period}',volume['moving_average_volume'][f'avg_{period}d'],sum(v[-period:])/period if len(v)>=period else None)
            for period in [5,20,60]:check(case,f'rvol_{period}',volume['relative_volume'][f'rvol_{period}d'],v[-1]/(sum(v[-period:])/period) if len(v)>=period and sum(v[-period:])>0 else None)
            for period,spy,qqq in [(20,1.25,-1.5),(60,-2.5,2.25),(120,3.75,0)]:
                change=(c[-1]/c[-1-period]-1)*100 if len(c)>period else None
                for field,expected in [(f'stock_return_{period}d',change),(f'stock_vs_spy_{period}d',change-spy if change is not None else None),(f'stock_vs_qqq_{period}d',change-qqq if change is not None else None)]:check(case,field,actual['relative_strength'][field],expected)
        for p in [6,14,21]:check(case,f'rsi_{p}',actual[f'rsi_{p}'],rsi(c,p))
        tr=[h[0]-l[0]]+[max(h[i]-l[i],abs(h[i]-c[i-1]),abs(l[i]-c[i-1])) for i in range(1,len(c))]
        atr=sum(tr[:14])/14
        percentages=[atr/c[13]*100]
        for i in range(14,len(c)):
            atr=(atr*13+tr[i])/14
            percentages.append(atr/c[i]*100)
        check(case,'atr14',actual['atr']['value'],atr)
        check(case,'atr_pct',actual['atr']['atr_pct'],atr/c[-1]*100)
        for window in [60,120,250]:
            expected=sum(value<=percentages[-1] for value in percentages[-window:])/window*100 if len(percentages)>=window else None
            check(case,f'atr_percentile_{window}',actual['atr'][f'atr_percentile_{window}'],expected)
        fast,slow=ema(c,12),ema(c,26)
        macd=[a-b if a is not None and b is not None else None for a,b in zip(fast,slow)]
        signal=ema([x if x is not None else 0 for x in macd],9)
        histogram=[a-b if a is not None and b is not None else None for a,b in zip(macd,signal)]
        check(case,'macd_line',actual['macd']['macd_line'],macd[-1]);check(case,'signal_line',actual['macd']['signal_line'],signal[-1]);check(case,'histogram',actual['macd']['histogram'],histogram[-1])
        for n in [1,3,5]:check(case,f'histogram_change_{n}',actual['macd'][f'histogram_change_{n}'],histogram[-1]-histogram[-1-n])
        middle=sum(c[-20:])/20;deviation=math.sqrt(sum((x-middle)**2 for x in c[-20:])/20)
        for field,expected in [('middle_band',middle),('upper_band',middle+2*deviation),('lower_band',middle-2*deviation),('percent_b',(c[-1]-(middle-2*deviation))/(4*deviation) if deviation else None),('bandwidth_pct',4*deviation/middle*100)]:check(case,field,actual['bollinger'][field],expected)
        k=d=50
        for i in range(8,len(c)):
            highest=max(h[i-8:i+1]);lowest=min(l[i-8:i+1]);rsv=(c[i]-lowest)/(highest-lowest)*100 if highest!=lowest else 50
            k=2/3*k+1/3*rsv;d=2/3*d+1/3*k
        j=3*k-2*d
        for field,expected in [('k',k),('d',d),('j',j),('overbought',j>=80),('oversold',j<=20)]:check(case,'kdj_'+field,actual['kdj'][field],expected)
        obv=sum((v[i] if c[i]>c[i-1] else -v[i] if c[i]<c[i-1] else 0) for i in range(1,len(c)))
        conflict = (source.get('volume_validation') or {}).get('status') == 'conflict'
        check(case,'obv',actual['obv'].get('raw_value'),None if conflict else obv)
        if conflict:
            check(case,'obv_quarantine',actual['obv'].get('unavailable_reason') == 'source_data_conflict',True)
        # Preserve the project's documented rolling-mean ADX/DI variant.
        dm_plus,dm_minus=[],[]
        for i in range(1,len(c)):
            up,down=h[i]-h[i-1],l[i-1]-l[i]
            dm_plus.append(up if up>down and up>0 else 0);dm_minus.append(down if down>up and down>0 else 0)
        trs=tr[1:];plus=[];minus=[];dx=[]
        for i in range(13,len(trs)):
            total=sum(trs[i-13:i+1]);p=100*sum(dm_plus[i-13:i+1])/total if total else None;m=100*sum(dm_minus[i-13:i+1])/total if total else None
            plus.append(p);minus.append(m);dx.append(100*abs(p-m)/(p+m) if p is not None and m is not None and p+m else None)
        valid=[x for x in dx[-14:] if x is not None]
        check(case,'adx',actual['adx'].get('adx'),sum(valid)/len(valid) if valid else None);check(case,'plus_di',actual['adx'].get('plus_di'),plus[-1]);check(case,'minus_di',actual['adx'].get('minus_di'),minus[-1])
        fib_sources=[(actual.get('fibonacci') or {},h,l,(80,3,8,4) if case['interval']=='4h' else (100,4,10,10),'fib')]
        if case['interval']=='1d':
            allowed=set(quote['history'].get('session_calendar',{}).get('completed_week_keys',[]))
            from datetime import date,timedelta
            grouped={}
            for stamp,high,low,close in zip(source['timestamps'],h,l,c):
                day=date.fromisoformat(stamp[:10]);key=(day-timedelta(days=day.weekday())).isoformat()
                if key in allowed:grouped.setdefault(key,[]).append((high,low,close))
            weekly_h=[max(x[0] for x in values) for _,values in sorted(grouped.items())]
            weekly_l=[min(x[1] for x in values) for _,values in sorted(grouped.items())]
            fib_sources.append((actual.get('weekly_fibonacci') or {},weekly_h,weekly_l,(104,2,5,15),'weekly_fib'))
        for fib,source_h,source_l,parameters,prefix in fib_sources:
            if fib.get('swing_low') is None:continue
            lookback,width,separation,minimum=parameters
            highs,lows=source_h[-lookback:],source_l[-lookback:]
            high_pivots=[i for i in range(width,len(highs)-width) if all(highs[i]>highs[j] for j in range(i-width,i+width+1) if j!=i)]
            low_pivots=[i for i in range(width,len(lows)-width) if all(lows[i]<lows[j] for j in range(i-width,i+width+1) if j!=i)]
            candidates=[]
            for low_index in low_pivots:
                for high_index in high_pivots:
                    span=highs[high_index]-lows[low_index]
                    if high_index-low_index>=separation and span/lows[low_index]*100>=minimum:candidates.append((high_index,span,lows[low_index],highs[high_index]))
            for high_index in high_pivots:
                for low_index in low_pivots:
                    span=highs[high_index]-lows[low_index]
                    if low_index-high_index>=separation and span/lows[low_index]*100>=minimum:candidates.append((low_index,span,lows[low_index],highs[high_index]))
            selected=sorted(candidates,key=lambda item:(-item[0],-item[1]))[0]
            check(case,prefix+'_independent_pivot_low',fib['swing_low'],selected[2]);check(case,prefix+'_independent_pivot_high',fib['swing_high'],selected[3])
            low,high=fib['swing_low'],fib['swing_high'];span=high-low;up=fib['swing_direction']=='up_swing'
            for key,level in fib['retracement_levels'].items():
                ratio=float(key)/100;check(case,prefix+'_retracement_'+key,level['price'],high-span*ratio if up else low+span*ratio)
            for key,level in fib['extension_levels'].items():
                ratio=float(key)/100;check(case,prefix+'_extension_'+key,level['price'],low+span*ratio if up else high-span*ratio)
    result={'cases':len(cases),'checks':len(checks),'failures':[x for x in checks if not x['pass']],'all_passed':all(x['pass'] for x in checks),'tolerance':'relative 1e-9 with absolute floor 1e-9','meaning':'independent formulas on same source bars, not independent market-price certification','checks_detail':checks}
    Path(args.output).write_text(json.dumps(result,indent=2));print(json.dumps({key:result[key] for key in ['cases','checks','all_passed','failures']}))


if __name__=='__main__':main()
