import { defineConfig } from "vitest/config";
import path from "node:path";

// Tests laufen gegen eine echte Postgres-Datenbank (PGlite im Speicher, über
// den Postgres-Socket-Server). Eine Verbindung → Testdateien nacheinander.
const DB_URL = "postgresql://postgres:postgres@127.0.0.1:55439/postgres?sslmode=disable&connection_limit=1&pgbouncer=true";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL: DB_URL,
      DIRECT_URL: DB_URL,
      // Benachrichtigungen in Tests nie wirklich verschicken
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
      SMTP_HOST: "",
      TWILIO_ENABLED: "false",
    },
  },
});
