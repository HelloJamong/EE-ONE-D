FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY prisma ./prisma
COPY src ./src

RUN npm run prisma:generate && npm run build

FROM node:20-alpine AS runner
ARG VERSION=latest
LABEL org.opencontainers.image.version="${VERSION}"
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY package.json package-lock.json ./
COPY CHANGELOG.md ./

CMD ["sh", "-c", "node dist/scripts/prepareMigrations.js && npm run migrate:deploy && npm start"]
