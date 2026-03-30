# Deploiement Memory Game sur VPS

Guide pas a pas pour deployer l'application sur un VPS avec Docker et Nginx.

---

## Prerequis

- Un VPS avec Ubuntu/Debian
- Un nom de domaine pointe vers l'IP du VPS (ex: `memory.madiyanke.com`)
- Un compte DockerHub

---

## Etape 1 : Installer Docker sur le VPS

Se connecter au VPS en SSH :

```bash
ssh hamidou@VOTRE_IP_VPS -p VOTRE_PORT_SSH
```

Installer Docker (si pas deja fait) :

```bash
# Mettre a jour le systeme
sudo apt update && sudo apt upgrade -y

# Installer Docker
curl -fsSL https://get.docker.com | sh

# Ajouter l'utilisateur au groupe docker (evite d'utiliser sudo)
sudo usermod -aG docker $USER

# IMPORTANT : se deconnecter et reconnecter pour prendre effet
exit
```

Se reconnecter et verifier :

```bash
ssh hamidou@VOTRE_IP_VPS -p VOTRE_PORT_SSH
docker --version
docker compose version
```

Les deux commandes doivent afficher une version. Si `docker compose` ne fonctionne pas :

```bash
sudo apt install docker-compose-plugin -y
```

---

## Etape 2 : Creer le dossier de production

```bash
mkdir -p ~/memory-game
cd ~/memory-game
```

---

## Etape 3 : Creer le fichier docker-compose.prod.yml

```bash
cat > docker-compose.prod.yml << 'EOF'
services:
  memory-game:
    image: ${DOCKERHUB_USERNAME}/memory-game:${IMAGE_TAG:-latest}
    container_name: memory-game-prod
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    volumes:
      - app-logs:/app/logs

volumes:
  app-logs:
EOF
```

---

## Etape 4 : Creer le fichier .env de production

Remplacez `VOTRE_USERNAME_DOCKERHUB` par votre vrai username DockerHub :

```bash
cat > .env << 'EOF'
DOCKERHUB_USERNAME=VOTRE_USERNAME_DOCKERHUB
IMAGE_TAG=latest
EOF
```

Verifier :

```bash
cat .env
```

---

## Etape 5 : Se connecter a DockerHub depuis le VPS

```bash
docker login
```

Entrez votre username et votre token DockerHub (pas le mot de passe, le **token**).
Pour creer un token : https://hub.docker.com/settings/security > New Access Token.

Verifier que la connexion fonctionne :

```bash
docker pull hello-world
```

---

## Etape 6 : Premier deploiement manuel

```bash
cd ~/memory-game

# Charger les variables d'environnement
export $(cat .env | xargs)

# Pull l'image depuis DockerHub
docker compose -f docker-compose.prod.yml pull

# Lancer le conteneur
docker compose -f docker-compose.prod.yml up -d

# Verifier que ca tourne
docker compose -f docker-compose.prod.yml ps
```

Vous devez voir le conteneur `memory-game-prod` avec le status `Up` et `(healthy)` apres ~30 secondes.

Tester localement :

```bash
curl http://localhost:3000
```

Vous devez voir le HTML de la page d'accueil.

---

## Etape 7 : Configurer Nginx comme reverse proxy

### 7.1 Installer Nginx (si pas deja fait)

```bash
sudo apt install nginx -y
```

### 7.2 Creer la configuration du site

```bash
sudo nano /etc/nginx/sites-available/memory-game
```

Coller ce contenu (remplacez `memory.madiyanke.com` par votre domaine) :

```nginx
server {
    listen 80;
    server_name memory.madiyanke.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Headers standards
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket (obligatoire pour Socket.IO)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts pour les connexions longues (Socket.IO)
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### 7.3 Activer le site

```bash
# Creer le lien symbolique
sudo ln -sf /etc/nginx/sites-available/memory-game /etc/nginx/sites-enabled/

# Verifier la syntaxe Nginx
sudo nginx -t

# Recharger Nginx
sudo systemctl reload nginx
```

### 7.4 Tester

Ouvrir dans un navigateur : `http://memory.madiyanke.com`

---

## Etape 8 : Activer HTTPS avec Certbot

```bash
# Installer Certbot
sudo apt install certbot python3-certbot-nginx -y

# Generer le certificat SSL
sudo certbot --nginx -d memory.madiyanke.com

# Suivre les instructions (entrer email, accepter les conditions)
```

Certbot modifiera automatiquement la config Nginx pour rediriger HTTP vers HTTPS.

Verifier le renouvellement automatique :

```bash
sudo certbot renew --dry-run
```

---

## Etape 9 : Configurer les secrets GitHub Actions

Aller sur votre repository GitHub > Settings > Secrets and variables > Actions > New repository secret.

Creer ces 6 secrets :

| Nom du secret        | Valeur                                         |
|---------------------|-------------------------------------------------|
| `DOCKERHUB_USERNAME` | Votre username DockerHub                        |
| `DOCKERHUB_TOKEN`    | Votre token DockerHub (pas le mot de passe)     |
| `VPS_HOST`           | L'adresse IP de votre VPS                       |
| `VPS_USERNAME`       | `hamidou` (votre user SSH)                      |
| `VPS_SSH_KEY`        | Le contenu de votre cle privee SSH (voir ci-dessous) |
| `SSH_PORT`           | Le port SSH de votre VPS (22 par defaut)        |

### Generer la cle SSH (si pas deja fait)

**Sur votre machine locale** :

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy_key
```

**Copier la cle publique sur le VPS** :

```bash
ssh-copy-id -i ~/.ssh/github_deploy_key.pub -p VOTRE_PORT_SSH hamidou@VOTRE_IP_VPS
```

**Copier la cle privee dans le secret GitHub** :

```bash
cat ~/.ssh/github_deploy_key
```

Copier TOUT le contenu (y compris `-----BEGIN OPENSSH PRIVATE KEY-----` et `-----END OPENSSH PRIVATE KEY-----`) et le coller dans le secret `VPS_SSH_KEY`.

---

## Etape 10 : Tester le pipeline

Depuis votre machine de developpement :

```bash
git add .
git commit -m "ci: pipeline Docker + deploy VPS"
git push origin main
```

Aller sur GitHub > Actions pour suivre l'execution du pipeline.

---

## Commandes utiles sur le VPS

### Voir l'etat du conteneur

```bash
cd ~/memory-game
docker compose -f docker-compose.prod.yml ps
```

### Voir les logs de l'application

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=100
```

### Redemarrer l'application

```bash
cd ~/memory-game
docker compose -f docker-compose.prod.yml restart
```

### Deployer manuellement une nouvelle version

```bash
cd ~/memory-game
export $(cat .env | xargs)
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
```

### Arreter l'application

```bash
cd ~/memory-game
docker compose -f docker-compose.prod.yml down
```

---

## Architecture finale

```
                    Internet
                       |
                       v
              [ Nginx (port 80/443) ]
              - SSL/TLS termination
              - Reverse proxy
              - WebSocket support
                       |
                       v
           [ Docker: memory-game-prod ]
           - Node.js + Express
           - Socket.IO
           - Port 3000 (local only)
```

```
                    GitHub
                       |
                   git push main
                       |
                       v
              [ GitHub Actions ]
              1. Build image Docker
              2. Push sur DockerHub
              3. SSH vers VPS
              4. Pull nouvelle image
              5. Redemarrer conteneur
```
