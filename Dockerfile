FROM node:24-bookworm-slim AS development
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.34.5
WORKDIR /workspace
RUN chown node:node /workspace
USER node
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --chown=node:node apps/backend/package.json ./apps/backend/package.json
COPY --chown=node:node apps/frontend/package.json ./apps/frontend/package.json
RUN pnpm install --frozen-lockfile
COPY --chown=node:node . .
RUN pnpm db:generate && pnpm build

FROM development AS backend
EXPOSE 3000
CMD ["pnpm", "--filter", "@whatsflow/backend", "dev"]

FROM development AS frontend
EXPOSE 5173
CMD ["pnpm", "--filter", "@whatsflow/frontend", "dev"]
