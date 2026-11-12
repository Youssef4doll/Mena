# The shop on Google Cloud Run

Vercel paused the shop on 12 November 2026: its free plan allows 4 hours of
server CPU a month, and only for personal, non-commercial sites. The shop now
runs on Google Cloud Run, which has a free tier about twelve times larger and
allows a shop.

## What it costs

Nothing inside the free tier, which resets every month (request-based billing, tier 1 regions):

| Free each month | About |
|---|---|
| 180,000 vCPU-seconds | 50 hours of server work (Vercel free: 4) |
| 360,000 GiB-seconds | memory while answering |
| 2 million requests | pages, pictures, scripts |
| 0.5 GB image storage | the setup keeps only the 3 newest images |

A budget alert e-mails the owner at 0.50 USD and at 1 USD, long before anything
real. A card is needed to open the account; Google charges only past the free tier.

Settings that keep it free: one server at most (`--max-instances=1`), stopped
when nobody visits (`--min-instances=0`). The price of that: the first visitor
after a quiet time waits 2 to 4 seconds while the server starts.

## How it works

- **Every push to `main`** runs `.github/workflows/deploy-cloud-run.yml` on
  GitHub: it signs in to Google without a stored key (Workload Identity
  Federation, allowed only for this repository's main branch), reads the
  shop's settings from the Cloud Run service (hidden in the public log), runs
  `npm run build` (database migrations first, as on Vercel), builds the image
  from `Dockerfile`, and puts it live. Then it checks `/`, `/ar` and
  `/sitemap.xml` answer.
- **The settings** (database, `APP_SECRET`, e-mail and AI keys) live only in the
  Cloud Run service. To change one: Cloud Run → mena → Edit & deploy new
  revision → Variables & secrets. Never in GitHub, never in the chat.
- **Pictures** are resized once and kept in the server's memory
  (`src/app/api/img/[id]/[w]/route.ts`); phones keep them for a year.
- **E-mails and SMS for a new order** are sent before the answer, not after
  (`AFTER_INLINE=1` in the image, `src/lib/after-response.ts`): Cloud Run gives
  CPU only while a request runs, and work left for later could stall.

## Setting it up (once, about 30 minutes)

1. **Pause the Meta ads** while the shop is offline.
2. Go to <https://console.cloud.google.com>, sign in with Google, accept the
   terms. Top bar → project list → **New project**, name it `mena-shop`.
3. **Billing**: menu → Billing → link a billing account to `mena-shop` (add
   your card). The free tier applies by itself.
4. Open **Cloud Shell**: the `>_` button at the top right of the console. In
   it, paste:

   ```
   curl -fsSL https://raw.githubusercontent.com/Youssef4doll/Mena/main/deploy/cloud-run-setup.sh -o setup.sh && bash setup.sh
   ```

   It asks whether to copy the shop's settings from Vercel: answer **Y**, open
   the Vercel link it shows, log in, and it copies them itself. (Or answer n and
   type each value from Vercel → mena → Settings → Environment Variables; what
   you type is hidden.) `APP_SECRET` must be the same as on Vercel, or the
   order tracking links and admin logins stop working.
5. It ends with two lines, `GCP_PROJECT_ID=…` and `GCP_PROJECT_NUMBER=…`. Send
   them to Claude (they are not secrets). Claude puts them in
   `deploy/cloud-run.env`; the next push deploys the shop, about 6 minutes.

## After the shop is live at its new address

The address changes from `menatn.vercel.app` to
`https://mena-<project number>.europe-west1.run.app`. Update:

- the **Instagram bio** link;
- the **Meta ads** (destination URL) and Meta Business → Brand safety →
  Domains (verify the new address);
- **Google Search Console**: add the new address as a property;
- **Konnect**, if a callback address is typed in its dashboard.

Better, once, and then it never changes again: buy a domain (about 30 to 40
TND a year, e.g. `mena.tn` or `menashop.com`) and connect it in Cloud Run →
Manage custom domains. Set `NEXT_PUBLIC_SITE_URL` to it in the service.

When Vercel's pause ends (12 December), `menatn.vercel.app` can send every old
link to the new address: in Vercel set `NEXT_PUBLIC_SITE_URL` to the new
address and redeploy (the shop's one-address rule then redirects everything).
