import { createApp } from "./app";
import { database, migrate } from "./db";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = database(process.env.DATABASE_URL);
await migrate(db);
const app = await createApp(db, {
  origin: process.env.APP_ORIGIN ?? "http://localhost:3000",
  production: process.env.NODE_ENV === "production",
});
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3001) });
for (const event of ["SIGINT", "SIGTERM"])
  process.on(event, () => {
    void app
      .close()
      .then(() => db.close())
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
