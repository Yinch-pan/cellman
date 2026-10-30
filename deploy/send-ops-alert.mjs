// Credentials arrive via systemd EnvironmentFile or private stdin from the
// Windows monitor. Never print credentials or SMTP response bodies.
import nodemailer from "nodemailer";
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
try {
  const message = JSON.parse(raw || "{}");
  const config = message.smtp ?? process.env;
  const to = message.to ?? process.env.ALERT_TO;
  if (!to || !config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS || !config.MAIL_FROM)
    throw Error("ALERT_NOT_CONFIGURED");
  if (![465, 587].includes(Number(config.SMTP_PORT))) throw Error("INVALID_SMTP_PORT");
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST, port: Number(config.SMTP_PORT),
    secure: Number(config.SMTP_PORT) === 465, requireTLS: true,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  try {
    if (message.verifyOnly) await transport.verify();
    else {
      const result = await transport.sendMail({
        from: { name: "cellman operations", address: config.MAIL_FROM },
        to, subject: String(message.subject ?? "cellman alert").slice(0, 180),
        text: String(message.text ?? "").slice(0, 12000),
      });
      if (!result.accepted.length) throw Error("RECIPIENT_REJECTED");
    }
    console.log(JSON.stringify({ ok: true, sent: !message.verifyOnly }));
  } finally { transport.close(); }
} catch {
  console.error("Operations email failed; check private SMTP configuration and connectivity.");
  process.exitCode = 1;
}
