# Utiliser une image Node.js officielle
FROM node:18-alpine
RUN apk add --no-cache curl

# Créer le répertoire de l'application
WORKDIR /app

# Copier les fichiers de configuration
COPY server/package.json ./

# Installer les dépendances
RUN npm install --production

# Copier le code source
COPY . .

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
RUN chown -R nextjs:nodejs /app
USER nextjs

# Exposer le port
EXPOSE 3000

# Variable d'environnement pour le port
ENV PORT 3000

# Démarrer l'application
CMD ["node", "server/server.js"]