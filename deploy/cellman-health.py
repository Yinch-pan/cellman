#!/usr/bin/env python3
"""Host checks with change/recovery notifications and six-hour reminders."""
import json
import pathlib
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from urllib.request import urlopen


def notification_due(warnings, previous, timestamp):
    changed = sorted(warnings) != sorted(previous.get('notifiedWarnings', []))
    reminder = bool(warnings) and timestamp - previous.get('lastNotifiedAt', 0) >= 21600
    retry_ready = timestamp - previous.get('lastAlertAttemptAt', 0) >= 900
    return (changed or reminder) and retry_ready


def collect(now):
    warnings = []
    mem = {k: int(v.split()[0]) for k, v in
           (line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())}
    disk = shutil.disk_usage('/')
    if mem['MemAvailable'] < 150 * 1024:
        warnings.append('Available memory below 150 MiB')
    if disk.free < 4 * 1024**3:
        warnings.append('Free disk below 4 GiB')
    try:
        with urlopen('http://127.0.0.1:3001/api/health', timeout=5) as response:
            if not json.load(response).get('ok'):
                warnings.append('Database/application health check failed')
    except Exception:
        warnings.append('Database/application health check unavailable')
    backups = list(pathlib.Path('/var/backups/cellman').glob('cellman-*.dump'))
    newest = max((p.stat().st_mtime for p in backups), default=0)
    if now.timestamp() - newest > 36 * 3600:
        warnings.append('Database backup older than 36 hours or missing')
    certificates = ['cellman-ip']
    if pathlib.Path('/etc/nginx/sites-enabled/cellman-domain').exists():
        certificates.append('cellman-domain')
    for certificate in certificates:
        if subprocess.run(['openssl', 'x509', '-checkend', '172800', '-noout', '-in',
                           '/etc/letsencrypt/live/' + certificate + '/fullchain.pem'],
                          capture_output=True, timeout=5).returncode:
            warnings.append('TLS certificate ' + certificate + ' expires within 48 hours or cannot be read')
    for service in ['cellman-cert-renew.service', 'cellman-backup.service', 'cellman-restore-check.service']:
        result = subprocess.run(['systemctl', 'show', service, '-p', 'Result', '--value'],
                                capture_output=True, text=True, timeout=5)
        if result.returncode or result.stdout.strip() not in ('success', ''):
            warnings.append(service + ' last execution failed')
    try:
        restored = json.loads(pathlib.Path('/var/lib/cellman-restore/status.json').read_text())
        if not restored.get('ok') or now.timestamp() - restored['verifiedAt'] > 8 * 86400:
            warnings.append('Restore/replay verification failed or older than 8 days')
    except (OSError, ValueError, KeyError):
        warnings.append('Restore/replay verification has no successful record')
    return {'at': now.isoformat(), 'availableMemoryMiB': mem['MemAvailable'] // 1024,
            'freeDiskGiB': round(disk.free / 1024**3, 2), 'backupAt': newest,
            'warnings': sorted(warnings)}


def main():
    state_path = pathlib.Path('/var/lib/cellman-health/status.json')
    try:
        previous = json.loads(state_path.read_text())
    except (OSError, ValueError):
        previous = {}
    now = datetime.now(timezone.utc)
    try:
        record = collect(now)
    except Exception:
        record = {'at': now.isoformat(), 'warnings': ['Health collector failed; inspect service journal']}
    for key in ('notifiedWarnings', 'lastNotifiedAt', 'lastAlertAttemptAt'):
        if key in previous:
            record[key] = previous[key]
    if notification_due(record['warnings'], previous, now.timestamp()):
        record['lastAlertAttemptAt'] = now.timestamp()
        message = {'subject': '[cellman host] ' + ('Problem detected' if record['warnings'] else 'Recovered'),
                   'text': now.isoformat() + '\n\n' + '\n'.join(record['warnings'] or ['All monitored host checks recovered.'])}
        try:
            result = subprocess.run(['/usr/local/bin/node', '/srv/cellman/current/deploy/send-ops-alert.mjs'],
                                    input=json.dumps(message), text=True, capture_output=True, timeout=35)
            record['alertDeliveredToSmtp'] = result.returncode == 0
        except Exception:
            record['alertDeliveredToSmtp'] = False
        if record['alertDeliveredToSmtp']:
            record['notifiedWarnings'] = record['warnings']
            record['lastNotifiedAt'] = now.timestamp()
    temporary = state_path.with_suffix('.tmp')
    temporary.write_text(json.dumps(record))
    temporary.replace(state_path)
    print(json.dumps(record))
    return int(bool(record['warnings']) or record.get('alertDeliveredToSmtp') is False)


if __name__ == '__main__':
    sys.exit(main())
