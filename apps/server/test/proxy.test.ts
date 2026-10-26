import { it, expect } from "vitest";
import { createApp } from "../src/app";
import type { Database } from "../src/db/pool";

it("allows only the explicitly configured site origins, including port", async () => {
  const app = createApp(
    {} as Database,
    "https://example.test:8443",
    false,
    [],
    ["https://example.test"],
  );
  try {
    for (const origin of [
      "https://example.test:8443",
      "https://example.test",
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/login",
            headers: { origin },
            payload: {},
          })
        ).statusCode,
      ).toBe(400);
    }
    for (const origin of [
      "https://example.test:8444",
      "https://evil.test",
      "null",
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/login",
            headers: { origin },
            payload: {},
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
});

it("only the configured local proxy can forward client IPs for login limits", async () => {
  const app = createApp({} as Database, "https://example.test", false, [
    "127.0.0.1",
  ]);
  const request = (remoteAddress: string, ip: string) =>
    app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress,
      headers: { origin: "https://example.test", "x-forwarded-for": ip },
      payload: {},
    });
  try {
    for (let i = 0; i < 12; i++)
      expect((await request("127.0.0.1", "192.0.2.10")).statusCode).toBe(400);
    expect((await request("127.0.0.1", "192.0.2.10")).statusCode).toBe(429);
    expect((await request("127.0.0.1", "192.0.2.11")).statusCode).toBe(400);
    for (let i = 0; i < 12; i++)
      expect(
        (await request("203.0.113.1", `192.0.2.${i + 30}`)).statusCode,
      ).toBe(400);
    expect((await request("203.0.113.1", "192.0.2.99")).statusCode).toBe(429);
  } finally {
    await app.close();
  }
});

it("health fails when the database cannot be reached", async () => {
  let available = true;
  const app = createApp({
    query: async () => {
      if (!available) throw Error("offline");
      return { rows: [] };
    },
  } as unknown as Database);
  try {
    expect((await app.inject("/api/health")).statusCode).toBe(200);
    available = false;
    expect((await app.inject("/api/health")).statusCode).toBe(500);
  } finally {
    await app.close();
  }
});
