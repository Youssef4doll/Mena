#!/usr/bin/env node
/**
 * The Prisma CLI, with one variable filled in when it safely can be.
 *
 *   node scripts/prisma.mjs migrate deploy
 *   node scripts/prisma.mjs generate
 *
 * Why this exists: `schema.prisma` declares `directUrl = env("DATABASE_URL_UNPOOLED")`,
 * and `prisma migrate deploy` needs that variable set even to run — it fails
 * up front with
 *
 *   Error code: P1012 — Environment variable not found: DATABASE_URL_UNPOOLED
 *
 * before touching a database, which reads like a schema problem and is
 * actually a missing variable.
 *
 * `prisma generate` does NOT need it — generate only reads the schema and
 * writes a client, it opens no connection at all, and runs fine against a
 * pooled DATABASE_URL with no DATABASE_URL_UNPOOLED in sight (verified: a
 * bare `prisma generate` against a pgbouncer URL and no direct one succeeds).
 * An earlier version of this script applied the check to every subcommand,
 * including generate — which meant `npm install`'s postinstall hook (plain
 * `prisma generate`, no migration in sight) failed on any host whose
 * DATABASE_URL is pooled, even though generate had nothing to complain about.
 * So the fill-in/refuse logic below runs only ahead of `migrate`.
 *
 * Two cases hide behind the migrate error and they want opposite answers:
 *
 *  - There is no pooler. DATABASE_URL is already a direct connection (a plain
 *    Postgres server, a local database, a direct Neon string). The two URLs
 *    would be identical, and demanding both is pure ceremony. We fill it in.
 *
 *  - There *is* a pooler and DATABASE_URL points at it. Copying it across
 *    would trade a clear "variable not found" for a much worse failure later:
 *    PgBouncer's transaction pooling mode does not support the session-level
 *    features migrations use, so `migrate deploy` would fail mid-run against a
 *    real database. We refuse, and say exactly what to set and where.
 *
 * The pooler is detected from the connection string itself — PgBouncer's own
 * query flag, Supabase's pooler hostname, or its pooler port. Anything else is
 * assumed direct, which is the safe assumption: if it is wrong, `migrate`
 * fails against the pooler and says so, rather than corrupting anything.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Prisma loads .env itself, but that happens after this script has already
// decided what to do — so load it here too, the same way Next does. Optional:
// if @next/env is unavailable for any reason, Prisma's own loading still
// applies and we simply cannot see the file to make the decision.
try {
  const mod = await import("@next/env");
  const loadEnvConfig = mod.loadEnvConfig ?? mod.default?.loadEnvConfig;
  loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
} catch {
  /* no loader — fall through with whatever the platform provided */
}

const DIRECT = "DATABASE_URL_UNPOOLED";
const url = process.env.DATABASE_URL;
const isMigrate = process.argv[2] === "migrate";

if (isMigrate && !process.env[DIRECT] && url) {
  const pooled =
    /[?&]pgbouncer=true/i.test(url) ? "it carries ?pgbouncer=true"
      : /pooler\./i.test(url) ? "its host is a pooler"
        : /:6543(\/|\?|$)/.test(url) ? "it uses port 6543, the pooler port"
          : null;

  if (pooled) {
    console.error(
      `\n${DIRECT} is not set, and DATABASE_URL cannot stand in for it — ${pooled}.\n\n` +
        "Migrations need a direct connection: a pooler's transaction mode does not\n" +
        "support the session-level features they use.\n\n" +
        `Set ${DIRECT} to the direct string for the same database:\n\n` +
        "  Neon     — drop the \"-pooler\" out of the hostname; same user, password,\n" +
        "             database and port. Console: Project → Connect → toggle off\n" +
        '             "Connection pooling" to see it, or `neon env pull` writes\n' +
        "             both DATABASE_URL and DATABASE_URL_UNPOOLED for you.\n" +
        "  Supabase — same credentials on host db.<ref>.supabase.co, port 5432 — or\n" +
        '             the "Session pooler" string on port 5432 if your network is\n' +
        "             IPv4-only.\n\n" +
        "On Vercel: Settings → Environment Variables → add it to Production, Preview\n" +
        "and Development, then redeploy.\n"
    );
    process.exit(1);
  }

  // No pooler in the way: the direct URL is the URL.
  process.env[DIRECT] = url;
}

// npm puts node_modules/.bin on PATH for its own scripts, so a bare "prisma"
// resolves when this runs as one — and does not when someone runs
// `node scripts/prisma.mjs …` by hand, which then failed with a bare exit 1 and
// no explanation. Resolve the shim next to us first and only fall back to PATH.
const root = fileURLToPath(new URL("../", import.meta.url));
const windows = process.platform === "win32";
const local = join(root, "node_modules", ".bin", windows ? "prisma.cmd" : "prisma");
const bin = existsSync(local) ? local : "prisma";

const result = spawnSync(bin, process.argv.slice(2), {
  stdio: "inherit",
  // Windows cannot execute a .cmd shim without a shell. The arguments here are
  // bare tokens like "migrate deploy", so there is nothing to quote.
  shell: windows,
});

if (result.error) {
  console.error(`\nCould not run the Prisma CLI (${bin}): ${result.error.message}`);
  console.error("Is `npm install` finished? The CLI lives in node_modules/.bin.\n");
  process.exit(1);
}

process.exit(result.status ?? 1);
