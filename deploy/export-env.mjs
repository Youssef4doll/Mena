#!/usr/bin/env node
/**
 * The build needs the shop's settings (database, secrets) and they live in one
 * place: the Cloud Run service itself. This reads `gcloud run services describe
 * --format=json` and hands every variable to the next workflow steps through
 * $GITHUB_ENV, after telling GitHub to hide each value in the logs. The
 * repository is public, so its Actions logs are too: secrets, and also the
 * database host, user and name inside the connection URLs, are masked before
 * anything else can print them.
 *
 *   node deploy/export-env.mjs service.json
 */
import { readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const [file] = process.argv.slice(2);
const envFile = process.env.GITHUB_ENV;
if (!file || !envFile) {
  console.error("usage: GITHUB_ENV=... node deploy/export-env.mjs service.json");
  process.exit(1);
}

const svc = JSON.parse(readFileSync(file, "utf8"));
const env = svc?.spec?.template?.spec?.containers?.[0]?.env ?? [];
// Public on every page anyway: shown, so a wrong address is easy to spot in the log.
const PUBLIC = new Set(["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_DEFAULT_LANG", "SITE_ONE_HOST", "AFTER_INLINE"]);
// Set by Cloud Run or by the image, never copied into the build.
const SKIP = new Set(["PORT", "K_SERVICE", "K_REVISION", "K_CONFIGURATION", "HOSTNAME", "NODE_ENV"]);

const mask = (s) => {
  for (const line of String(s).split(/\r?\n/)) if (line.trim()) console.log(`::add-mask::${line}`);
};

let count = 0;
for (const { name, value } of env) {
  if (!name || value == null || SKIP.has(name)) continue;
  if (!PUBLIC.has(name)) {
    mask(value);
    if (/^postgres(ql)?:\/\//.test(value)) {
      try {
        const u = new URL(value);
        for (const part of [u.hostname, u.username, decodeURIComponent(u.password), u.pathname.slice(1)]) if (part.length > 2) mask(part);
      } catch {}
    }
  }
  const end = `EOF_${randomBytes(8).toString("hex")}`;
  appendFileSync(envFile, `${name}<<${end}\n${value}\n${end}\n`);
  count++;
}
console.log(`${count} settings read from Cloud Run (values hidden).`);
