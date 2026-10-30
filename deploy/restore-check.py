#!/usr/bin/env python3
"""Restore only into a fresh generated database; never restore over cellman."""
import json
import os
import pathlib
import subprocess
import time
import uuid


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=300, **kwargs)


def main():
    status = pathlib.Path('/var/lib/cellman-restore/status.json')
    name = 'cellman_verify_' + uuid.uuid4().hex
    created = False
    record = {'ok': False, 'attemptedAt': time.time()}
    try:
        backups = list(pathlib.Path('/var/backups/cellman').glob('cellman-*.dump'))
        backup = max(backups, key=lambda p: p.stat().st_mtime)
        if time.time() - backup.stat().st_mtime > 36 * 3600:
            raise RuntimeError('Backup is stale')
        run(['runuser', '-u', 'postgres', '--', 'createdb', '-T', 'template0', name])
        created = True
        with backup.open('rb') as data:
            run(['runuser', '-u', 'postgres', '--', 'pg_restore', '--exit-on-error', '--no-owner',
                 '--no-privileges', '-d', name], stdin=data)
        env = dict(os.environ, DATABASE_URL='postgresql://postgres@localhost/' + name + '?host=/var/run/postgresql')
        result = run(['runuser', '-u', 'postgres', '--preserve-environment', '--', '/usr/local/bin/node',
                      '--import', 'tsx', 'scripts/verify-saved-games.ts'],
                     cwd='/srv/cellman/current', env=env)
        record.update(ok=True, verifiedAt=time.time(), backup=backup.name, replay=json.loads(result.stdout))
    except Exception:
        record['error'] = 'Restore or replay verification failed; production database was not restored.'
    finally:
        if created:
            try:
                run(['runuser', '-u', 'postgres', '--', 'dropdb', name])
            except Exception:
                record.update(ok=False, cleanupRequired=name)
        temporary = status.with_suffix('.tmp')
        temporary.write_text(json.dumps(record))
        temporary.replace(status)
        print(json.dumps(record))
    return 0 if record['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
