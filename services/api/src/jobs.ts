import nodemailer from "nodemailer";
import { database } from "./db";
if (
  !process.env.DATABASE_URL ||
  !process.env.SMTP_URL ||
  !process.env.MAIL_FROM
)
  throw new Error("DATABASE_URL, SMTP_URL, MAIL_FROM are required");
const db = database(process.env.DATABASE_URL);
const transport = nodemailer.createTransport(process.env.SMTP_URL);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopping = true;
  });
while (!stopping) {
  try {
    await db.transaction(async (connection) => {
      const result = await connection.query<{
        id: string;
        recipient: string;
        subject: string;
        body: string;
        attempts: number;
      }>(
        "SELECT * FROM email_outbox WHERE delivered_at IS NULL AND attempts<8 AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      const email = result.rows[0];
      if (!email) return;
      try {
        await transport.sendMail({
          from: process.env.MAIL_FROM,
          to: email.recipient,
          subject: email.subject,
          text: email.body,
          messageId: `<${email.id}@requestlab.local>`,
        });
        await connection.query(
          "UPDATE email_outbox SET delivered_at=now(),body='[delivered]' WHERE id=$1",
          [email.id],
        );
      } catch {
        await connection.query(
          "UPDATE email_outbox SET attempts=attempts+1,next_attempt_at=$1 WHERE id=$2",
          [
            new Date(
              Date.now() + Math.min(3600000, 1000 * 2 ** email.attempts),
            ),
            email.id,
          ],
        );
        console.error("Email delivery failed; retry scheduled");
      }
    });
    await db.query("DELETE FROM sessions WHERE expires_at<now()");
    await db.query("DELETE FROM auth_tokens WHERE expires_at<now()");
  } catch {
    console.error("Background job iteration failed");
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
transport.close();
await db.close();
