#!/usr/bin/env python3
"""Root-only SMTP setup over SSH stdin; no credentials in command arguments/logs."""
import base64
import json
import os
import re
import secrets
import subprocess
from pathlib import Path
from urllib.request import urlopen
import time
import sys

def main():
    if os.geteuid() != 0:
        raise ValueError('root required')
    data = json.load(sys.stdin)
    values = {k: str(data.get(k, '')) for k in ('SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM')}
    if values['SMTP_PORT'] not in ('465', '587') or not re.fullmatch(r'[a-zA-Z0-9.-]+', values['SMTP_HOST']):
        raise ValueError('invalid server')
    if any(not v or any(c in v for c in '\r\n\x00') for v in values.values()):
        raise ValueError('invalid credentials')
    path = Path('/etc/cellman/mail.env')
    candidate = Path('/etc/cellman/mail.env.next')
    original = path.read_bytes() if path.exists() else None
    key = None
    for line in (original or b'').decode('utf8').splitlines():
        if line.startswith('MAIL_TOKEN_KEY='):
            key = line.partition('=')[2].strip().strip('"')
    values['MAIL_TOKEN_KEY'] = key or base64.b64encode(secrets.token_bytes(32)).decode('ascii')
    values['MAIL_ENABLED'] = 'true'
    def quote(value):
        return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'
    os.umask(0o077)
    candidate.write_text(''.join(k + '=' + quote(v) + '\n' for k, v in values.items()), encoding='utf8')
    os.chmod(candidate, 0o600)
    release = Path('/srv/cellman/current').resolve()
    activated = False
    try:
        checked = subprocess.run(['/usr/local/bin/node', '--env-file=' + str(candidate), '--import', 'tsx', 'scripts/check-mail.ts'], cwd=release, capture_output=True, timeout=40)
        if checked.returncode:
            print('SMTP verification failed. Current mail configuration was not changed. Check your authorization code and SMTP service.', file=sys.stderr)
            return 1
        if original is not None:
            backup = Path('/etc/cellman/mail.env.previous')
            backup.write_bytes(original)
            os.chmod(backup, 0o600)
        candidate.replace(path)
        activated = True
        started = subprocess.run(['systemctl', 'restart', 'cellman'], capture_output=True, timeout=50)
        healthy = False
        for _ in range(20):
            try:
                with urlopen('http://127.0.0.1:3001/api/auth/mail-status', timeout=2) as response:
                    healthy = bool(json.load(response).get('available'))
            except Exception:
                pass
            if healthy:
                break
            time.sleep(1)
        if started.returncode or not healthy:
            if original is not None:
                path.write_bytes(original)
            else:
                path.write_text('MAIL_ENABLED=false\n', encoding='utf8')
            os.chmod(path, 0o600)
            subprocess.run(['systemctl', 'restart', 'cellman'], capture_output=True, timeout=50)
            print('Activation failed. Previous mail configuration restored.', file=sys.stderr)
            return 1
        print('Mail enabled. Open Account settings in cellman, bind a receiving email, and confirm actual inbox delivery.')
        return 0
    except Exception:
        if activated:
            if original is not None:
                path.write_bytes(original)
            else:
                path.write_text('MAIL_ENABLED=false\n', encoding='utf8')
            os.chmod(path, 0o600)
            subprocess.run(['systemctl', 'restart', 'cellman'], capture_output=True, timeout=50)
        print('Setup interrupted; prior configuration retained or restored. Credentials were not printed.', file=sys.stderr)
        return 1
    finally:
        candidate.unlink(missing_ok=True)

try:
    sys.exit(main())
except Exception:
    # Input and provider errors may contain secrets; never echo exception details.
    print('Configuration could not complete. Credentials were not printed. Check input and server status.', file=sys.stderr)
    sys.exit(1)
