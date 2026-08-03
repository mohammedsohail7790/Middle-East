FROM node:20-alpine AS base
RUN apk add --no-cache ffmpeg

FROM base AS builder
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build --workspaces

FROM base AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/gateway/dist ./dist
COPY --from=builder /app/apps/gateway/package.json ./package.json
COPY --from=builder /app/packages ./packages

EXPOSE 3003
ENV PORT=3003
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3003/health || exit 1
CMD ["node", "dist/apps/gateway/src/index.js"]
