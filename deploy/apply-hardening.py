#!/usr/bin/env python3
"""Apply reviewed guardrails in explicit stages. Run as root on the game host.

SSH stage intentionally leaves a timed rollback armed; acknowledge it only from
a fresh, successful public-key connection with `--stage confirm-ssh`.
"""
import argparse
import json
import os
import pathlib
import shutil
import subprocess
from urllib.request import urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--stage', choices=['web', 'system', 'ssh', 'confirm-ssh'], required=True)
args = parser.parse_args()
if os.geteuid() != 0: raise SystemExit('root required')
os.umask(0o077)
source = pathlib.Path(__file__).resolve().parent
backup = pathlib.Path('/etc/cellman/hardening-20261026')
backup.mkdir(mode=0o700, exist_ok=True)
manifest_path = backup / 'files.json'
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

def run(*cmd): return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout.strip()

def save(target):
    p = pathlib.Path(target)
    if target not in manifest:
        stored = backup / target.lstrip('/').replace('/', '__')
        if p.exists(): shutil.copy2(p, stored)
        manifest[target] = str(stored) if p.exists() else None
        manifest_path.write_text(json.dumps(manifest, indent=2))
    return p

def install(name, target):
    p = save(target); p.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source / name, p); p.chmod(0o644)

def restore(target):
    if manifest[target]: shutil.copy2(manifest[target], target)
    else: pathlib.Path(target).unlink(missing_ok=True)

if args.stage == 'web':
    paths=['/etc/nginx/conf.d/cellman-limits.conf','/etc/nginx/sites-available/cellman']
    try:
        install('cellman-limits.nginx.conf',paths[0]); install('cellman.nginx.conf',paths[1])
        run('nginx','-t'); run('systemctl','reload','nginx')
        for url in ['https://8.210.238.62:8443/api/health','https://8.210.238.62:8444/','http://8.210.238.62/']:
            with urlopen(url,timeout=10) as r:
                if r.status != 200: raise RuntimeError('Site health check failed')
    except Exception:
        for p in paths:
            if p in manifest: restore(p)
        run('nginx','-t'); run('systemctl','reload','nginx'); raise
    print('Nginx guardrails active; game, Nature HTTPS and HTTP return 200.')

elif args.stage == 'system':
    install('cellman-resources.conf','/etc/systemd/system/cellman.service.d/60-resources.conf')
    install('journal-limits.conf','/etc/systemd/journald.conf.d/60-cellman-limits.conf')
    install('cellman-health.service','/etc/systemd/system/cellman-health.service')
    install('cellman-health.timer','/etc/systemd/system/cellman-health.timer')
    p=save('/etc/logrotate.d/nginx')
    text=p.read_text()
    if 'maxsize 20M' not in text:
        if '\tdaily\n' not in text: raise RuntimeError('Unexpected nginx logrotate format')
        p.write_text(text.replace('\tdaily\n','\tdaily\n\tmaxsize 20M\n',1))
    p=save('/etc/systemd/system/logrotate.timer.d/60-hourly-check.conf')
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text('[Timer]\nOnCalendar=\nOnCalendar=hourly\nRandomizedDelaySec=5m\n')
    p.chmod(0o644)
    role_backup=backup/'cellman-role-before.json'
    if not role_backup.exists():
        role_backup.write_text(run('runuser','-u','postgres','--','psql','-XAt','-c',"SELECT json_build_object('connectionLimit',rolconnlimit,'settings',rolconfig) FROM pg_roles WHERE rolname='cellman'"))
    run('runuser','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-c',"ALTER ROLE cellman CONNECTION LIMIT 20; ALTER ROLE cellman SET statement_timeout='10s'; ALTER ROLE cellman SET lock_timeout='3s'; ALTER ROLE cellman SET idle_in_transaction_session_timeout='15s';")
    run('systemctl','daemon-reload')
    run('systemctl','restart','systemd-journald','logrotate.timer')
    run('systemctl','restart','cellman')
    run('systemctl','enable','--now','cellman-health.timer')
    print('Resource, SQL, log retention and local health-check limits installed.')

elif args.stage == 'ssh':
    target='/etc/ssh/sshd_config.d/00-cellman-hardening.conf'
    save(target)
    script=backup/'rollback-ssh.sh'
    action=('cp '+manifest[target]+' '+target) if manifest[target] else ('rm -f '+target)
    script.write_text('#!/bin/sh\nset -eu\n'+action+'\n/usr/sbin/sshd -t\n/bin/systemctl reload ssh\n')
    script.chmod(0o700)
    run('systemd-run','--unit=cellman-ssh-rollback','--on-active=3m','/bin/sh',str(script))
    try:
        install('ssh-key-only.conf',target)
        run('/usr/sbin/sshd','-t')
        run('systemctl','reload','ssh')
    except Exception:
        restore(target);run('/usr/sbin/sshd','-t');run('systemctl','reload','ssh');raise
    print('Key-only SSH installed; rollback is armed for three minutes. Confirm from a NEW public-key SSH connection.')

elif args.stage == 'confirm-ssh':
    effective=run('/usr/sbin/sshd','-T')
    if 'passwordauthentication no' not in effective or 'kbdinteractiveauthentication no' not in effective:
        raise RuntimeError('Key-only policy not effective; leave rollback armed')
    run('systemctl','stop','cellman-ssh-rollback.timer')
    print('Fresh public-key SSH login verified; timed rollback cancelled.')
