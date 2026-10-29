import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(exec);

const URL = "postgresql://postgres:postgres@127.0.0.1:55439/postgres?sslmode=disable&connection_limit=1&pgbouncer=true";

let db: PGlite;
let server: PGLiteSocketServer;

export async function setup() {
  db = await PGlite.create();
  server = new PGLiteSocketServer({ db, port: 55439, host: "127.0.0.1" });
  await server.start();
  // Schema aus prisma/schema.prisma einspielen. Asynchron — execSync würde
  // diesen Prozess blockieren, in dem auch der Datenbankserver läuft.
  await run("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: URL, DIRECT_URL: URL },
  });
}

export async function teardown() {
  await server?.stop();
  await db?.close();
}
