"""OHLCV row validation and DST-safe XNYS session provenance."""
from collections import Counter
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import math
from zoneinfo import ZoneInfo


ET = ZoneInfo('America/New_York')

# Intraday regular-session volume may omit auctions and other daily volume.
# It must not substantially exceed the same completed Daily session. This
# one-sided ingestion check is not an indicator threshold or a repair ratio.
VOLUME_OVERCOUNT_TOLERANCE = 1.05
SOURCE_VALIDATION_VERSION = 1


def reconcile_intraday_volume(daily, intervals):
    """Compare only complete, contiguous sessions; retain no raw bar history."""
    daily_rows = {}
    for index, day in enumerate(daily.get('timestamps') or []):
        try:
            volume = float(daily['volumes'][index])
            end = datetime.fromisoformat(daily['bar_end_timestamps'][index])
            if end.tzinfo is None:
                continue
            if daily['completed'][index] is True and math.isfinite(volume) and volume > 0:
                daily_rows[str(day)[:10]] = (volume, end)
        except (KeyError, IndexError, TypeError, ValueError):
            continue
    results = {}
    for interval, source in intervals.items():
        groups = {}
        for index, raw_stamp in enumerate(source.get('timestamps') or []):
            try:
                stamp = datetime.fromisoformat(raw_stamp)
                end = datetime.fromisoformat(source['bar_end_timestamps'][index])
                if stamp.tzinfo is None or end.tzinfo is None:
                    continue
                stamp, end = stamp.astimezone(ET), end.astimezone(ET)
                volume = float(source['volumes'][index])
                if source['completed'][index] is True and math.isfinite(volume) and volume >= 0:
                    groups.setdefault(stamp.date().isoformat(), []).append((stamp, end, volume))
            except (KeyError, IndexError, TypeError, ValueError):
                continue
        checked, mismatches = 0, []
        for day, bars in groups.items():
            if day not in daily_rows:
                continue
            daily_volume, close = daily_rows[day]
            bars.sort(key=lambda row: row[0])
            # A missing opening or middle bar is incomplete coverage, not a
            # zero-volume bar. Do not compare it as a complete session.
            if bars[0][0].strftime('%H:%M') != '09:30' or bars[-1][1] != close:
                continue
            if any(left[1] != right[0] for left, right in zip(bars, bars[1:])):
                continue
            checked += 1
            total = sum(row[2] for row in bars)
            if total > daily_volume * VOLUME_OVERCOUNT_TOLERANCE:
                mismatches.append({'date': day, 'daily_volume': daily_volume,
                                   'intraday_volume': total, 'ratio': round(total / daily_volume, 4)})
        results[interval] = {'version': SOURCE_VALIDATION_VERSION,
                             'status': 'conflict' if mismatches else 'passed' if checked else 'not_checked',
                             'checked_sessions': checked, 'conflicting_sessions': len(mismatches),
                             'conflicting_dates': [row['date'] for row in mismatches],
                             'examples': mismatches[-5:], 'overcount_tolerance': VOLUME_OVERCOUNT_TOLERANCE,
                             'method': 'complete_regular_session_volume_upper_bound',
                             'unavailable_reason': 'source_data_conflict' if mismatches else None}
    return results


def daily_history_freshness(history, as_of=None):
    now = as_of or datetime.now(timezone.utc)
    timestamps = history.get('timestamps') or []
    if not timestamps:
        return {'state': 'unavailable', 'latest_date': None, 'expected_completed_date': None}
    calendar = exchange_calendar(now.astimezone(ET).year)
    schedule = calendar.schedule.loc[:now.astimezone(ET).date().isoformat()]
    closed = schedule.loc[schedule['close'] <= now]
    expected = closed.index[-1].date().isoformat() if len(closed) else None
    latest = str(timestamps[-1])[:10]
    return {'state': 'stale' if expected and latest < expected else 'current',
            'latest_date': latest, 'expected_completed_date': expected,
            'checked_at': now.isoformat(), 'calendar_source': 'exchange_calendars:XNYS'}


@lru_cache(maxsize=2)
def exchange_calendar(year):
    import exchange_calendars as calendars
    return calendars.get_calendar('XNYS', start=f'{year - 12}-01-01', end=f'{year + 1}-12-31')


def session(date, calendar=None):
    # A history frame already knows its latest year. Reuse that one calendar
    # for every date it covers instead of rebuilding one per historical year.
    if calendar is None or date < calendar.first_session.date() or date > calendar.last_session.date():
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
    duplicate_fields = set(frame.columns[frame.columns.duplicated()]).intersection(required)
    if not isinstance(frame.index, pd.DatetimeIndex) or any(key not in frame for key in required) or duplicate_fields:
        reason = 'invalid_timestamp_index' if not isinstance(frame.index, pd.DatetimeIndex) else 'duplicate_ohlcv_column' if duplicate_fields else 'missing_ohlcv_column'
        return frame.iloc[0:0].copy(), {'source_rows': len(frame), 'rejected_rows': len(frame), 'reasons': {reason: len(frame)}}
    for index, entry in enumerate(frame[list(required)].itertuples(index=True, name=None)):
        stamp = entry[0]
        if pd.isna(stamp) or (previous is not None and stamp <= previous):
            reasons['duplicate_or_unordered_timestamp'] += 1
            continue
        # Use source order even when the price row is rejected; an invalid row
        # must not make a later duplicate timestamp look like a fresh sample.
        previous = stamp
        values = []
        for raw in entry[1:]:
            try:
                value = float(raw)
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
    for stamp, close in schedule[['close']].itertuples(index=True, name=None):
        date = stamp.date()
        key = (date - timedelta(days=date.weekday())).isoformat()
        entry = weeks.setdefault(key, {'dates': [], 'close': close.to_pydatetime()})
        entry['dates'].append(date)
        entry['close'] = close.to_pydatetime()
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
