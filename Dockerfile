FROM node:18-alpine

# curl pour le healthcheck Docker
RUN apk add --no-cache curl

WORKDIR /app

# 1. Copier uniquement package.json pour profiter du cache Docker
COPY server/package.json ./

# 2. Installer les dépendances de production
RUN npm install --omit=dev

# 3. Copier le code source
COPY server/ ./server/
COPY public/ ./public/

# 4. Utilisateur non-root (sécurité)
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

CMD ["node", "server/server.js"]
