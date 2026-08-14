FROM docker.io/oven/bun:1-slim AS base
WORKDIR /app

# dependencies (cached unless the lockfile or schema changes)
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# source + build
COPY . .
RUN bunx prisma generate
RUN bun run build

VOLUME ["/notes"]
EXPOSE 3000

ENV NODE_ENV=production
ENV DATABASE_URL="file:/root/.cache/markdown-render/challenges.db"

CMD ["bun", "run", "start"]
