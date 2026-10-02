"""OHLCV row validation and DST-safe XNYS session provenance."""
from collections import Counter
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import math
from zoneinfo import ZoneInfo


ET = ZoneInfo('America/New_York')


@lru_cache(maxsize=2)
def exchange_calendar(year):
    import exchange_calendars as calendars
    return calendars.get_calendar('XNYS', start=f'{year - 12}-01-01', end=f'{year + 1}-12-31')


def session(date):
    calendar = exchange_calendar(date.year)
    key = date.isoformat()
    if not calendar.is_session(key):
        return None
    row = calendar.schedule.loc[key]
    return {'open': row['open'].to_pydatetime(), 'close': row['close'].to_pydatetime()}


def validate_frame(frame):
    import pandas as pd
    if frame is None:
        return pd.DataFrame(), {'source_rows': 0, 'rejected_rows': 0, 'reasons': {}}
    reasons = Counter()
    indices = []
    previous = None
    required = ('Open', 'High', 'Low', 'Close', 'Volume')
    if not isinstance(frame.index, pd.DatetimeIndex) or any(key not in frame for key in required):
        reason = 'invalid_timestamp_index' if not isinstance(frame.index, pd.DatetimeIndex) else 'missing_ohlcv_column'
        return frame.iloc[0:0].copy(), {'source_rows': len(frame), 'rejected_rows': len(frame), 'reasons': {reason: len(frame)}}
    for index, (stamp, row) in enumerate(frame.iterrows()):
        if pd.isna(stamp) or (previous is not None and stamp <= previous):
            reasons['duplicate_or_unordered_timestamp'] += 1
            continue
        # Use source order even when the price row is rejected; an invalid row
        # must not make a later duplicate timestamp look like a fresh sample.
        previous = stamp
        values = []
        for key in required:
            try:
                value = float(row[key])
            except (ValueError, TypeError):
                value = float('nan')
            values.append(value)
        o, h, l, c, v = values
        if not all(math.isfinite(x) for x in values):
            reasons['missing_or_nonfinite_ohlcv'] += 1
        elif min(o, h, l, c) <= 0:
            reasons['nonpositive_price'] += 1
        elif not l <= min(o, c) <= max(o, c) <= h:
            reasons['ohlc_envelope'] += 1
        elif v < 0:
            reasons['negative_volume'] += 1
        else:
            indices.append(index)
    clean = frame.iloc[indices].copy()
    prior = frame.attrs.get('validation') or {}
    audit = {'source_rows': max(len(frame), prior.get('source_rows', 0)),
             'rejected_rows': len(frame) - len(clean) + prior.get('rejected_rows', 0),
             'reasons': dict(Counter(prior.get('reasons') or {}) + reasons)}
    clean.attrs['validation'] = audit
    return clean, audit


def completed_week_metadata(frame, as_of=None):
    """Only full exchange-session weeks ending before as_of are completed."""
    if len(frame) == 0:
        return {'source': 'exchange_calendars:XNYS', 'completed_week_keys': [], 'excluded_weeks': 0}
    now = as_of or datetime.now(timezone.utc)
    dates = {stamp.date() for stamp in frame.index}
    first, last = min(dates), max(dates)
    calendar = exchange_calendar(last.year)
    start = first - timedelta(days=first.weekday())
    # Include the end of the last week, even when the final Daily bar is Thu.
    end = last + timedelta(days=6 - last.weekday())
    schedule = calendar.schedule.loc[start.isoformat():end.isoformat()]
    weeks = {}
    for stamp, row in schedule.iterrows():
        date = stamp.date()
        key = (date - timedelta(days=date.weekday())).isoformat()
        entry = weeks.setdefault(key, {'dates': [], 'close': row['close'].to_pydatetime()})
        entry['dates'].append(date)
        entry['close'] = row['close'].to_pydatetime()
    complete = [key for key, value in weeks.items() if value['close'] <= now and all(date in dates for date in value['dates'])]
    return {'source': 'exchange_calendars:XNYS', 'as_of': now.isoformat(), 'completed_week_keys': complete,
            'excluded_weeks': len(weeks) - len(complete), 'method': 'all_expected_sessions_present_and_final_session_closed'}


def validate_us_daily_frame(frame):
    clean, audit = validate_frame(frame)
    if len(clean) == 0:
        return clean, audit
    calendar = exchange_calendar(clean.index[-1].year)
    expected = {stamp.date() for stamp in calendar.sessions_in_range(clean.index[0].date().isoformat(), clean.index[-1].date().isoformat())}
    counts = Counter(stamp.date() for stamp in clean.index)
    closed = sum(stamp.date() not in expected for stamp in clean.index)
    duplicate = sum(stamp.date() in expected and counts[stamp.date()] > 1 for stamp in clean.index)
    # A multi-row intraday session cannot masquerade as one Daily observation.
    mask = [stamp.date() in expected and counts[stamp.date()] == 1 for stamp in clean.index]
    rejected = len(mask) - sum(mask)
    clean = clean.loc[mask].copy()
    audit['rejected_rows'] += rejected
    if closed:
        audit['reasons']['exchange_closed_daily_bar'] = closed
    if duplicate:
        audit['reasons']['multiple_bars_in_daily_session'] = duplicate
    clean.attrs['validation'] = audit
    return clean, audit
