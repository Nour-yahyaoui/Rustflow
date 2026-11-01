import { database, migrate } from "./db";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = database(process.env.DATABASE_URL);
try {
  await migrate(db);
  console.log("Cloud schema is up to date.");
} finally {
  await db.close();
}
