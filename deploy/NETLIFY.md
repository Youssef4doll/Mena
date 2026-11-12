# The shop on Netlify

Vercel paused the shop on 12 November 2026 (its free plan: 4 hours of server
CPU a month, personal use only). Google Cloud Run (`deploy/CLOUD-RUN.md`)
refused a prepaid card. Netlify asks for no card at all, runs Next.js 16 in
full (pages, server actions, the proxy, pictures) and builds from GitHub.

## The limit to know

The free plan has **300 credits a month**, and when they run out Netlify
pauses the site until the next month. What uses them:

| | Credits |
|---|---|
| One publish of the shop (production deploy) | 15 |
| 1 GB sent to visitors | 10 |
| Visits, pictures, scripts (per 10,000 requests) | about 2 to 3 |
| Server work | a little |

So **the shop publishes from the `live` branch, not from `main`**: finished
work is merged into `main` as before, and `live` is moved up to `main` a few
times a week (about 8 publishes a month, 120 credits), leaving the rest for
visitors. Pictures are kept on Netlify's CDN for a year after their first
visit (`netlify-cdn-cache-control: durable`), so they cost little.

Watch the credits in Netlify → Team → Usage & billing. If ads bring a lot of
traffic, publish less often that month.

## Setting it up (once, about 15 minutes)

1. Go to <https://app.netlify.com> and **sign up with GitHub** (no card).
2. **Add new project → Import an existing project → GitHub**, allow Netlify to
   see `Youssef4doll/Mena`, and pick it.
3. **Project name: `menatn`**, so the shop is at `https://menatn.netlify.app`
   (if taken: `mena-tn`).
4. **Branch to deploy: `live`**. The build command and the publish folder fill
   themselves from `netlify.toml`.
5. **Environment variables → Import from a .env file.** Paste these lines,
   each value copied from Vercel → mena → Settings → Environment Variables
   (the eye icon shows a value):

   ```
   DATABASE_URL=
   DATABASE_URL_UNPOOLED=
   APP_SECRET=
   ADMIN_EMAIL=
   ADMIN_PASSWORD=
   RESEND_API_KEY=
   BLOB_READ_WRITE_TOKEN=
   ANTHROPIC_API_KEY=
   ```

   - `APP_SECRET` must be **exactly the same** as on Vercel, or the order
     tracking links and the admin logins stop working.
   - Do **not** add `NEXT_PUBLIC_SITE_URL`: the shop uses Netlify's address by
     itself (and later your own domain, once connected).
   - Never paste these values in the chat.
6. **Deploy.** About 5 minutes. Then open `https://menatn.netlify.app`.
7. Save credits: **Project configuration → Build & deploy → Branches and deploy
   contexts → Configure**: Branch deploys **None**, Deploy Previews **None**.
8. If Netlify offers **Functions region** (Project configuration → Build &
   deploy → Functions), choose **EU Central (Frankfurt)**: next to the
   database, so pages answer faster.

## After the shop is live at its new address

Update the Instagram bio link, the Meta ads' destination URL, Meta Business →
Brand safety → Domains (verify the new address), Google Search Console (add
the new address), and Konnect if a callback address is typed in its dashboard.

Later, once: a domain of your own (about 30 to 40 TND a year) connected in
Netlify → Domain management. Then the address never changes again, whatever the
host.

When Vercel's pause ends (12 December), `menatn.vercel.app` can send old links
to the new address: in Vercel set `NEXT_PUBLIC_SITE_URL` to the new address and
redeploy once.
