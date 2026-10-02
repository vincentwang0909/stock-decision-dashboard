#!/usr/bin/env python3
"""Read-only bounded transport-to-serialization comparison; not price certification."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo
from curl_cffi import requests


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--quotes',type=Path,required=True)
    parser.add_argument('--raw-dir',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();args.raw_dir.mkdir(parents=True,exist_ok=True)
    def run(case):
        ticker,interval,period=case
        params={'interval':interval,'range':period,'includePrePost':'false','events':'div,splits'}
        result={'ticker':ticker,'interval':interval,'request':params,'as_of':datetime.now(timezone.utc).isoformat(),'source':'Yahoo chart HTTP JSON','adjustment_basis':'quote OHLC, not adjclose','max_retries':0}
        try:
            with requests.Session(impersonate='chrome') as session:
                response=session.get(f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}',params=params,timeout=(3,5))
            result['http_status']=response.status_code;response.raise_for_status()
            raw=response.content;file=args.raw_dir/f'{ticker}-{interval}-{period}.json';file.write_bytes(raw)
            result.update(raw_file=str(file),bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
            body=response.json()['chart'];payload=body['result'][0];meta=payload['meta'];rows=payload['indicators']['quote'][0]
            result['metadata']={k:meta.get(k) for k in ['dataGranularity','currency','exchangeTimezoneName','regularMarketTime','regularMarketPrice','previousClose','chartPreviousClose']}
            raw_by_stamp={}
            for i,stamp in enumerate(payload.get('timestamp',[])):
                day=datetime.fromtimestamp(stamp,timezone.utc)
                key=day.astimezone(ZoneInfo('America/New_York')).date().isoformat() if interval=='1d' else day.isoformat()
                raw_by_stamp[key]={key:values[i] if i<len(values) else None for key,values in rows.items()}
            quote=json.loads((args.quotes/f'{ticker}.json').read_text());source=quote['history'] if interval=='1d' else quote['history']['intervals'][interval]
            mismatches=[];missing=[];checks=0
            for i,stamp in enumerate(source['timestamps']):
                key=stamp[:10] if interval=='1d' else datetime.fromisoformat(stamp.replace('Z','+00:00')).astimezone(timezone.utc).isoformat()
                observed=raw_by_stamp.get(key)
                if observed is None:missing.append(stamp);continue
                for stored,raw_key in [('opens','open'),('highs','high'),('lows','low'),('closes','close'),('volumes','volume')]:
                    a,b=source[stored][i],observed.get(raw_key);checks+=1
                    if a is None or b is None or abs(a-b)>max(1,abs(a))*1e-7:mismatches.append({'timestamp':stamp,'field':stored,'serialized':a,'raw_http':b})
            result.update(returned_bars=len(raw_by_stamp),serialized_bars=len(source['timestamps']),first_returned=min(raw_by_stamp,default=None),last_returned=max(raw_by_stamp,default=None),matched_field_checks=checks,unmatched_serialized_timestamps=missing,mismatch_count=len(mismatches),mismatches=mismatches[:20],daily_timestamp_method='exchange-date label; provider midnight versus HTTP regular open' if interval=='1d' else 'UTC instant')
        except Exception as error:result['error']=str(error)
        return result
    cases=[(p.stem,interval,period) for p in sorted(args.quotes.glob('*.json')) for interval,period in [('1d','10y'),('4h','365d')]]
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,cases))
    report={'read_only':True,'concurrency':2,'cases':results,'meaning':'Same-provider serialization agreement; corporate-action basis and independent true prices are not certified.'}
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({'cases':len(results),'errors':sum('error' in c for c in results),'mismatches':sum(c.get('mismatch_count',0) for c in results)}))


if __name__=='__main__':main()
