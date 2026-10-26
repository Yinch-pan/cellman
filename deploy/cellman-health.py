#!/usr/bin/env python3
"""Local checks only; external notification destinations are not configured."""
import json
import pathlib
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from urllib.request import urlopen

warnings = []
mem = {k: int(v.split()[0]) for k, v in (line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())}
disk = shutil.disk_usage('/')
if mem['MemAvailable'] < 150 * 1024: warnings.append('available memory below 150 MiB')
if disk.free < 4 * 1024**3: warnings.append('free disk below 4 GiB')
try:
    with urlopen('http://127.0.0.1:3001/api/health', timeout=5) as r:
        if not json.load(r).get('ok'): warnings.append('game health check failed')
except Exception: warnings.append('game health check unavailable')
backups = list(pathlib.Path('/var/backups/cellman').glob('cellman-*.dump'))
now = datetime.now(timezone.utc)
if not backups or now.timestamp() - max(p.stat().st_mtime for p in backups) > 36 * 3600:
    warnings.append('database backup older than 36 hours')
if subprocess.run(['openssl', 'x509', '-checkend', '86400', '-noout', '-in', '/etc/letsencrypt/live/cellman-ip/fullchain.pem'], capture_output=True).returncode:
    warnings.append('TLS certificate expires within 24 hours or cannot be read')
record = {'at':now.isoformat(),'availableMemoryMiB':mem['MemAvailable']//1024,'freeDiskGiB':round(disk.free/1024**3,2),'warnings':warnings}
pathlib.Path('/var/lib/cellman-health/status.json').write_text(json.dumps(record))
print(json.dumps(record))
sys.exit(bool(warnings))
