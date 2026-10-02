"""Also loaded by Render services whose existing command is `gunicorn server:app`."""
import faulthandler
from importlib.metadata import version
import os
import sys

bind = f"0.0.0.0:{os.environ.get('PORT', '8000')}"
workers = 1
worker_class = "gthread"
threads = 2
timeout = 120
preload_app = False  # Schedulers/native libraries must initialize in the worker.
# This service doesn't use Gunicorn's control API. Avoid an extra master
# asyncio thread and its fork/restart callbacks on the small Render instance.
control_socket_disable = True
capture_output = True

# Include fatal native stack traces; SIGSEGV is distinct from an OOM kill.
faulthandler.enable(all_threads=True)


def on_starting(server):
    dependencies = {name: version(name) for name in ('gunicorn', 'numpy', 'pandas', 'yfinance', 'curl_cffi')}
    server.log.info("Dashboard runtime: Python=%s dependencies=%s workers=%s threads=%s timeout=%s preload=%s",
                    sys.version.split()[0], dependencies, server.cfg.workers, server.cfg.threads,
                    server.cfg.timeout, server.cfg.preload_app)


def post_fork(server, worker):
    faulthandler.enable(all_threads=True)
