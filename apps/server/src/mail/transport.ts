import nodemailer from "nodemailer";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
export interface Message {
  to: string;
  subject: string;
  text: string;
  tokenHash?: string;
  gameId?: string;
  seat?: string;
  waitId?: string;
}
export interface Mailer {
  enabled: boolean;
  seal: (message: Message) => string;
  open: (payload: string) => Message;
  send: (message: Message, id: string) => Promise<void>;
  verify: () => Promise<void>;
}
export function encryptedMailer(
  key: Buffer,
  send: Mailer["send"],
  verify: Mailer["verify"] = async () => {},
): Mailer {
  if (key.length !== 32)
    throw Error("MAIL_TOKEN_KEY must contain 32 base64-encoded bytes");
  return {
    enabled: true,
    send,
    verify,
    seal(message) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([
        cipher.update(JSON.stringify(message), "utf8"),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
    },
    open(payload) {
      const data = Buffer.from(payload, "base64"),
        decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([
          decipher.update(data.subarray(28)),
          decipher.final(),
        ]).toString("utf8"),
      );
    },
  };
}
export const disabledMailer: Mailer = {
  enabled: false,
  seal() {
    throw Error("MAIL_DISABLED");
  },
  open() {
    throw Error("MAIL_DISABLED");
  },
  async send() {
    throw Error("MAIL_DISABLED");
  },
  async verify() {
    throw Error("MAIL_DISABLED");
  },
};
export function configuredMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  if (env.MAIL_ENABLED !== "true") return disabledMailer;
  const cfg = z
    .object({
      SMTP_HOST: z.string().min(1),
      SMTP_PORT: z.coerce
        .number()
        .pipe(z.union([z.literal(465), z.literal(587)])),
      SMTP_USER: z.string().min(1),
      SMTP_PASS: z.string().min(1),
      MAIL_FROM: z.email(),
      MAIL_TOKEN_KEY: z.string().min(1),
    })
    .safeParse(env);
  if (!cfg.success)
    throw Error(
      "Mail configuration incomplete; check SMTP settings and encryption key",
    );
  const c = cfg.data,
    transport = nodemailer.createTransport({
      host: c.SMTP_HOST,
      port: c.SMTP_PORT,
      secure: c.SMTP_PORT === 465,
      requireTLS: true,
      auth: { user: c.SMTP_USER, pass: c.SMTP_PASS },
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    });
  return encryptedMailer(
    Buffer.from(c.MAIL_TOKEN_KEY, "base64"),
    async (message, id) => {
      const info = await transport.sendMail({
        from: { name: "cellman", address: c.MAIL_FROM },
        to: message.to,
        subject: message.subject,
        text: message.text,
        messageId: `<${id}@${c.MAIL_FROM.split("@")[1]}>`,
      });
      if (!info.accepted.length) throw Error("MAIL_RECIPIENT_REJECTED");
    },
    async () => {
      await transport.verify();
    },
  );
}
