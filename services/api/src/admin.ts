import { database } from "./db";
const email = process.argv[2];
if (!email || !process.env.DATABASE_URL)
  throw new Error(
    "Usage: DATABASE_URL=… npx tsx services/api/src/admin.ts verified-admin@example.com",
  );
const db = database(process.env.DATABASE_URL);
const result = await db.query(
  "UPDATE users SET is_admin=true WHERE email=$1 AND verified_at IS NOT NULL RETURNING id",
  [email.toLowerCase()],
);
await db.close();
if (!result.rows.length) throw new Error("Verified account not found");
console.log("Administrator role explicitly granted to the specified account.");
