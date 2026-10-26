// Single-process service: count open streams, not requests per minute. Entries
// exist only while a connection is open; closing twice cannot free another slot.
export class ConnectionBudget {
  private users = new Map<string, number>();
  private ips = new Map<string, number>();
  private total = 0;
  constructor(private limits = { user: 8, ip: 32, total: 160 }) {}

  acquire(user: string, ip: string): (() => void) | undefined {
    if (
      this.total >= this.limits.total ||
      (this.users.get(user) ?? 0) >= this.limits.user ||
      (this.ips.get(ip) ?? 0) >= this.limits.ip
    )
      return;
    this.total++;
    this.users.set(user, (this.users.get(user) ?? 0) + 1);
    this.ips.set(ip, (this.ips.get(ip) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.total--;
      for (const [map, key] of [
        [this.users, user],
        [this.ips, ip],
      ] as const) {
        const n = map.get(key)! - 1;
        if (n) map.set(key, n);
        else map.delete(key);
      }
    };
  }
}

export const accountLimit = (
  group: string,
  max: number,
  timeWindow = "1 minute",
) => ({
  config: {
    rateLimit: {
      max,
      timeWindow,
      hook: "preHandler" as const,
      keyGenerator: (req: { user: { id: string } | null; ip: string }) =>
        `${group}:${req.user ? "user:" + req.user.id : "ip:" + req.ip}`,
    },
  },
});
