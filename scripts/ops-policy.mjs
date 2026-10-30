export function validBackup(manifest) {
  return /^cellman-[A-Za-z0-9T-]+\.dump$/.test(manifest?.name ?? "") &&
    /^[a-f0-9]{64}$/.test(manifest?.sha256 ?? "") &&
    Number.isSafeInteger(manifest?.bytes) && manifest.bytes > 0 &&
    Number.isFinite(manifest?.mtime) && manifest.mtime > 0;
}

export function alertDue(warnings, previous, now) {
  const changed = JSON.stringify([...warnings].sort()) !==
    JSON.stringify([...(previous.notifiedWarnings ?? [])].sort());
  const reminder = warnings.length > 0 && now - (previous.lastNotifiedAt ?? 0) >= 6 * 3600;
  const retryReady = now - (previous.lastAlertAttemptAt ?? 0) >= 15 * 60;
  const confirmed = warnings.length === 0 || (previous.failureStreak ?? 0) >= 1;
  return confirmed && retryReady && (changed || reminder);
}
