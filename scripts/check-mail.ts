// Tests SMTP connection/authentication only. Never prints credentials or sends mail.
import { configuredMailer } from "../apps/server/src/mail/transport";
try {
  const mailer = configuredMailer();
  if (!mailer.enabled) throw Error("disabled");
  await mailer.verify();
  console.log(
    "SMTP connection and authentication verified. Inbox delivery still needs a real verification email.",
  );
} catch {
  console.error(
    "SMTP verification failed. Check host, port, account, authorization code and provider restrictions. Credentials were not logged.",
  );
  process.exitCode = 1;
}
