# The shop on Google Cloud Run.
#
# The build happens before this file (the GitHub workflow runs `npm run build`
# with NEXT_OUTPUT=standalone, which also applies the database migrations), so
# the image only holds the finished server: .next/standalone, its static files
# and public/. Small, starts fast, no npm install inside.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080 \
    # Cloud Run gives CPU only while a request runs: e-mails and SMS go before the answer (src/lib/after-response.ts).
    AFTER_INLINE=1

# Prisma's engine needs OpenSSL; the slim image has the library, this makes sure of it and of the CA certificates.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Owned by the user the server runs as: Next writes its page cache under .next/cache.
COPY --chown=node:node .next/standalone ./
COPY --chown=node:node .next/static ./.next/static
COPY --chown=node:node public ./public

USER node
EXPOSE 8080
CMD ["node", "server.js"]
