"""Service-wide budgets. A caller timeout never frees a running task's slot."""
from collections import OrderedDict
from collections.abc import MutableMapping
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import threading
import time


class TaskBudgetExceeded(RuntimeError):
    pass


class BoundedTaskPool:
    def __init__(self, name, workers, queue_limit):
        self.name = name
        self.workers = max(1, int(workers))
        self.capacity = self.workers + max(0, int(queue_limit))
        self._executor = ThreadPoolExecutor(max_workers=self.workers, thread_name_prefix=name)
        self._lock = threading.RLock()
        self._tasks = {}
        self._running = set()
        self._submitted = 0
        self._shared = 0
        self._rejected = 0

    def submit(self, key, function, *args, **kwargs):
        with self._lock:
            existing = self._tasks.get(key)
            if existing is not None:
                self._shared += 1
                return existing
            if len(self._tasks) >= self.capacity:
                self._rejected += 1
                raise TaskBudgetExceeded(f'{self.name} capacity exhausted ({self.capacity}); running work remains budgeted')
            def run():
                with self._lock:
                    self._running.add(key)
                try:
                    return function(*args, **kwargs)
                finally:
                    with self._lock:
                        self._running.discard(key)
            future = self._executor.submit(run)
            self._tasks[key] = future
            self._submitted += 1
            def release(done):
                with self._lock:
                    if self._tasks.get(key) is done:
                        self._tasks.pop(key, None)
            future.add_done_callback(release)
            return future

    def snapshot(self):
        with self._lock:
            return {'workers': self.workers, 'capacity': self.capacity, 'in_flight': len(self._tasks),
                    'running': len(self._running), 'queued': max(0, len(self._tasks) - len(self._running)),
                    'submitted': self._submitted, 'shared': self._shared, 'rejected': self._rejected}

    def drain(self, timeout):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            with self._lock:
                if not self._tasks:
                    return True
            time.sleep(0.02)
        return self.snapshot()['in_flight'] == 0

    def shutdown(self):
        self._executor.shutdown(wait=True, cancel_futures=True)


class BoundedTTLCache(MutableMapping):
    """Keep one value per key, with expiry, LRU, and serialized-byte budgets."""
    def __init__(self, max_entries, max_bytes):
        self.max_entries = max(1, int(max_entries))
        self.max_bytes = max(1, int(max_bytes))
        self._values = OrderedDict()
        self._sizes = {}
        self._bytes = 0
        self._lock = threading.RLock()

    def _remove(self, key):
        self._bytes -= self._sizes.pop(key, 0)
        return self._values.pop(key)

    def purge(self, now=None, allowed=None):
        now = time.time() if now is None else now
        with self._lock:
            expired = [k for k, v in self._values.items() if v.get('expiresAt', 0) <= now or (allowed is not None and k not in allowed)]
            for key in expired:
                self._remove(key)
            return len(expired)

    def __getitem__(self, key):
        with self._lock:
            self.purge()
            value = self._values[key]
            self._values.move_to_end(key)
            return value

    def __setitem__(self, key, value):
        size = len(json.dumps(value, ensure_ascii=False, separators=(',', ':'), default=str).encode('utf-8'))
        with self._lock:
            self.purge()
            if key in self._values:
                self._remove(key)
            if size > self.max_bytes:
                return  # persistent cache remains available; no oversized RAM entry
            self._values[key] = value
            self._sizes[key] = size
            self._bytes += size
            while len(self._values) > self.max_entries or self._bytes > self.max_bytes:
                self._remove(next(iter(self._values)))

    def __delitem__(self, key):
        with self._lock:
            self._remove(key)

    def __iter__(self):
        with self._lock:
            self.purge()
            return iter(list(self._values))

    def __len__(self):
        with self._lock:
            self.purge()
            return len(self._values)

    def snapshot(self):
        with self._lock:
            self.purge()
            return {'entries': len(self._values), 'serialized_bytes': self._bytes,
                    'entry_limit': self.max_entries, 'serialized_byte_limit': self.max_bytes,
                    'byte_method': 'JSON bytes, not Python object RSS'}


class ApplyToken:
    """Only an awaiting, current generation may publish a fetched result."""
    def __init__(self, generation, current):
        self.generation = generation
        self._current = current
        self._abandoned = threading.Event()

    def abandon(self):
        self._abandoned.set()

    @property
    def valid(self):
        return not self._abandoned.is_set() and self.generation == self._current()


def memory_snapshot():
    cgroup = {}
    # Resolve the calling process's cgroup instead of assuming a root container.
    directory = Path('/sys/fs/cgroup')
    try:
        relative = next(line.split(':', 2)[2] for line in Path('/proc/self/cgroup').read_text().splitlines() if line.startswith('0::'))
        resolved = directory / relative.lstrip('/')
        if (resolved / 'memory.current').exists():
            directory = resolved
    except (OSError, StopIteration):
        pass
    for name in ('memory.current', 'memory.peak', 'memory.max'):
        try:
            raw = (directory / name).read_text().strip()
            cgroup[name] = int(raw) if raw.isdigit() else raw
        except OSError:
            cgroup[name] = None
    rss = pss = None
    try:
        status = Path('/proc/self/status').read_text().splitlines()
        rss = next(int(line.split()[1]) * 1024 for line in status if line.startswith('VmRSS:'))
        pss = sum(int(line.split()[1]) * 1024 for line in Path('/proc/self/smaps_rollup').read_text().splitlines() if line.startswith('Pss:'))
    except (OSError, StopIteration):
        # macOS ru_maxrss is a process high-water mark, not a current reading.
        pass
    return {'pid': os.getpid(), 'rss_bytes': rss, 'pss_bytes': pss, 'threads': threading.active_count(), 'cgroup': cgroup}
