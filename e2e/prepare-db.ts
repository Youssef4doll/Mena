import { execSync } from "node:child_process";
import { assertLocal, TEST_DB } from "./targets";

/**
 * The local test database, brought up to date: migrations applied (never a
 * reset — nothing is deleted), the admin account, the demo catalogue if it is
 * not there yet. The tests are written to pass on a database that already
 * holds earlier runs' orders. Run by the test web server's command, before
 * the server starts (Playwright starts web servers before global setup).
 */
assertLocal();
const env = { ...process.env, DATABASE_URL: TEST_DB, DATABASE_URL_UNPOOLED: TEST_DB, ADMIN_EMAIL: "e2e@mena.test", ADMIN_PASSWORD: "e2e-password-123", ADMIN_RESET: "1" };
execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
execSync("npx tsx prisma/seed-demo.ts", { env, stdio: "inherit" });
