#!/usr/bin/env bash
# One-time setup of the shop on Google Cloud Run. Run it in Google Cloud Shell
# (the terminal in the Google Cloud console), from the project you created:
#
#   curl -fsSL https://raw.githubusercontent.com/Youssef4doll/Mena/main/deploy/cloud-run-setup.sh -o setup.sh && bash setup.sh
#
# What it does, every step safe to run again:
#   1. turns on the Google services the shop needs;
#   2. makes a place for the shop's images (keeps only the 3 newest, to stay free);
#   3. lets GitHub deploy to this project without any stored key (Workload
#      Identity Federation), only from Youssef4doll/Mena's main branch;
#   4. asks for the shop's settings (database, secrets): from Vercel
#      automatically, or typed one by one, hidden; they go straight into
#      Cloud Run and never into GitHub or a file that stays;
#   5. creates the service with a placeholder page (the first GitHub deploy
#      replaces it), limited to one server so it stays inside the free tier;
#   6. sets a budget alert at 1 USD.
# At the end it prints two lines to send to Claude (not secrets).
set -euo pipefail

REGION=europe-west1
SERVICE=mena
REPO=Youssef4doll/Mena

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  ✓ %s\n' "$*"; }

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT_ID" ]; then
  echo "No project selected. Run: bash setup.sh YOUR_PROJECT_ID"
  exit 1
fi
gcloud config set project "$PROJECT_ID" >/dev/null 2>&1
NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
URL="https://$SERVICE-$NUMBER.$REGION.run.app"
DEPLOYER="mena-deployer@$PROJECT_ID.iam.gserviceaccount.com"
RUNTIME="mena-runtime@$PROJECT_ID.iam.gserviceaccount.com"
say "Project $PROJECT_ID — the shop will be at $URL"

say "1/6 Turning on the services"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com \
  cloudbilling.googleapis.com billingbudgets.googleapis.com --quiet
BILLING=$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null || true)
if [ -z "$BILLING" ]; then
  echo "Billing is not linked to this project yet. In the console: Billing → Link a billing account, then run this again."
  exit 1
fi
ok "services on, billing linked"

say "2/6 Image storage"
if ! gcloud artifacts repositories describe mena --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create mena --repository-format=docker --location="$REGION" --description="Mena shop images" --quiet
fi
POLICY=$(mktemp)
cat > "$POLICY" <<'JSON'
[
  {"name": "keep-newest-3", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 3}},
  {"name": "delete-older", "action": {"type": "Delete"}, "condition": {"tagState": "any", "olderThan": "1d"}}
]
JSON
gcloud artifacts repositories set-cleanup-policies mena --location="$REGION" --policy="$POLICY" --no-dry-run --quiet >/dev/null
rm -f "$POLICY"
ok "europe-west1/mena, only the 3 newest images kept"

say "3/6 Letting GitHub deploy (no stored key)"
for sa in mena-deployer mena-runtime; do
  if ! gcloud iam service-accounts describe "$sa@$PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$sa" --display-name="Mena: $sa" --quiet
  fi
done
for role in roles/run.admin roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$DEPLOYER" --role="$role" --condition=None --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" --member="serviceAccount:$DEPLOYER" --role=roles/iam.serviceAccountUser --quiet >/dev/null
if ! gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub" --quiet
fi
if ! gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
    --display-name="GitHub Actions" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='$REPO' && assertion.ref=='refs/heads/main'" --quiet
fi
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" --quiet >/dev/null
ok "only $REPO, branch main, can deploy"

say "4/6 The shop's settings"
WORK=$(mktemp -d)
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
answer=""
read -r -p "Copy the settings from Vercel automatically? It opens a Vercel login. [Y/n] " answer || true
if [[ ! "$answer" =~ ^[Nn] ]]; then
  ( cd "$WORK" \
    && npx --yes vercel@latest login \
    && npx --yes vercel@latest link --yes --project mena \
    && npx --yes vercel@latest env pull "$WORK/vercel.env" --environment=production --yes ) || echo "  Vercel did not answer: type them instead."
fi
if [ ! -s "$WORK/vercel.env" ]; then
  echo "Type each value from Vercel → mena → Settings → Environment Variables (Production)."
  echo "What you type is hidden. Press Enter to leave an optional one empty."
  : > "$WORK/typed.env"
  for name in DATABASE_URL DATABASE_URL_UNPOOLED APP_SECRET ADMIN_EMAIL ADMIN_PASSWORD RESEND_API_KEY BLOB_READ_WRITE_TOKEN ANTHROPIC_API_KEY; do
    value=""
    read -r -s -p "  $name: " value || true
    echo
    [ -n "$value" ] && printf '%s\t%s\n' "$name" "$value" >> "$WORK/typed.env"
  done
fi
# Into one JSON file (valid YAML for --env-vars-file), whatever the quotes inside the values.
SITE_URL="$URL" node - "$WORK" <<'NODE'
const fs = require("fs");
const dir = process.argv[2];
const out = {};
const pulled = `${dir}/vercel.env`;
if (fs.existsSync(pulled) && fs.statSync(pulled).size > 0) {
  for (const line of fs.readFileSync(pulled, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = JSON.parse(v);
    out[m[1]] = v;
  }
} else {
  for (const line of fs.readFileSync(`${dir}/typed.env`, "utf8").split("\n")) {
    const i = line.indexOf("\t");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
}
// Vercel's own variables mean nothing on Cloud Run; PORT is Cloud Run's.
for (const k of Object.keys(out)) if (/^(VERCEL|TURBO|NX)_/.test(k) || k === "PORT" || out[k] === "") delete out[k];
if (!out.DATABASE_URL || !out.APP_SECRET) {
  console.error("DATABASE_URL and APP_SECRET are required (APP_SECRET must be the SAME as on Vercel, or the order tracking links and admin logins stop working).");
  process.exit(1);
}
out.NEXT_PUBLIC_SITE_URL = process.env.SITE_URL;
out.SITE_ONE_HOST = "1";
fs.writeFileSync(`${dir}/env.json`, JSON.stringify(out), { mode: 0o600 });
console.log(`  ✓ ${Object.keys(out).length} settings ready: ${Object.keys(out).join(", ")}`);
NODE

say "5/6 Creating the service"
if gcloud run services describe "$SERVICE" --region="$REGION" >/dev/null 2>&1; then
  gcloud run services update "$SERVICE" --region="$REGION" --env-vars-file="$WORK/env.json" --quiet >/dev/null
  ok "settings updated (the shop keeps its current version)"
else
  gcloud run deploy "$SERVICE" --region="$REGION" --image=us-docker.pkg.dev/cloudrun/container/hello \
    --service-account="$RUNTIME" --env-vars-file="$WORK/env.json" --allow-unauthenticated \
    --cpu=1 --memory=1Gi --cpu-boost --min-instances=0 --max-instances=1 --concurrency=80 --timeout=60 --port=8080 --quiet >/dev/null
  ok "created with a placeholder page; the first GitHub deploy puts the shop in"
fi
rm -rf "$WORK"

say "6/6 Budget alert"
ACCOUNT="${BILLING#billingAccounts/}"
if gcloud billing budgets list --billing-account="$ACCOUNT" --format='value(displayName)' 2>/dev/null | grep -q '^Mena alert$'; then
  ok "already there"
elif gcloud billing budgets create --billing-account="$ACCOUNT" --display-name="Mena alert" --budget-amount=1USD \
     --threshold-rule=percent=0.5 --threshold-rule=percent=1.0 --filter-projects="projects/$PROJECT_ID" --quiet >/dev/null 2>&1; then
  ok "an e-mail if this project ever costs 0.50 USD, then 1 USD"
else
  echo "  Could not set it here (maybe your billing currency is not USD): in the console, Billing → Budgets & alerts → Create, 1 in your currency."
fi

say "Done. Send these two lines to Claude (they are not secrets):"
echo "GCP_PROJECT_ID=$PROJECT_ID"
echo "GCP_PROJECT_NUMBER=$NUMBER"
echo
echo "The shop's new address, live after the first deploy: $URL"
