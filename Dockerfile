FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json tsconfig.json ./
RUN npm install

COPY prisma ./prisma
COPY src ./src

RUN npm run prisma:generate && npm run build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY package.json ./

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
