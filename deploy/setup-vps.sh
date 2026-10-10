#!/usr/bin/env bash
#
# One-shot provisioning for a fresh Ubuntu 22.04/24.04 Hostinger VPS.
#
#   sudo bash deploy/setup-vps.sh yourdomain.com
#
# Installs Node 22, PostgreSQL 16, Nginx and certbot; creates the `expensex`
# system user and database; and leaves you one `npm run build` away from a
# running app. Safe to re-run: every step checks before it acts.
#
# It deliberately does NOT write your .env — you do that, so the session secret
# and the database password are never in a file anyone else has a copy of.

set -euo pipefail

DOMAIN="${1:-}"
APP_USER="expensex"
APP_DIR="/var/www/expensex"
DB_NAME="expensex"
DB_USER="expensex"

if [[ $EUID -ne 0 ]]; then
  echo "Run this with sudo." >&2
  exit 1
fi

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: sudo bash deploy/setup-vps.sh yourdomain.com" >&2
  exit 1
fi

step() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }

step "Updating packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git ufw

step "Installing Node.js 22"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -c2-3)" -lt 20 ]]; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key |
    gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi
node -v

step "Installing PostgreSQL"
apt-get install -y postgresql postgresql-contrib
systemctl enable --now postgresql

step "Creating the database role and database"
DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  echo "  role ${DB_USER} already exists — leaving its password alone"
  DB_PASSWORD="<the password you set earlier>"
else
  sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';"
fi
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  echo "  database ${DB_NAME} already exists"
else
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
fi

step "Creating the application user and directory"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  adduser --system --group --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

step "Installing Nginx and certbot"
apt-get install -y nginx certbot python3-certbot-nginx
mkdir -p /var/www/certbot

step "Opening the firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"

cat <<SUMMARY

──────────────────────────────────────────────────────────────────────────────
 Provisioning done. Next, as yourself:

 1. Upload and unpack the deploy bundle into ${APP_DIR}
      sudo -u ${APP_USER} unzip expensex-deploy.zip -d ${APP_DIR}

 2. Create ${APP_DIR}/.env with exactly these three lines:

      DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}?schema=public"
      SESSION_SECRET="${SECRET}"
      APP_URL="https://${DOMAIN}"

      sudo chown ${APP_USER}:${APP_USER} ${APP_DIR}/.env
      sudo chmod 600 ${APP_DIR}/.env

 3. Install, migrate and build:
      cd ${APP_DIR}
      sudo -u ${APP_USER} npm ci
      sudo -u ${APP_USER} npx prisma migrate deploy
      sudo -u ${APP_USER} npm run build

 4. Start it:
      sudo cp deploy/expensex.service /etc/systemd/system/expensex.service
      sudo systemctl daemon-reload && sudo systemctl enable --now expensex

 5. Put Nginx in front of it and get a certificate:
      sudo cp deploy/nginx/expensex.conf /etc/nginx/sites-available/expensex.conf
      sudo sed -i 's/expensex.example.com/${DOMAIN}/g' /etc/nginx/sites-available/expensex.conf
      sudo ln -sf /etc/nginx/sites-available/expensex.conf /etc/nginx/sites-enabled/
      sudo rm -f /etc/nginx/sites-enabled/default
      sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}
      sudo nginx -t && sudo systemctl reload nginx

 The session cookie is Secure in production, so sign-in only works over HTTPS.
 Finish step 5 before trying to log in.
──────────────────────────────────────────────────────────────────────────────

SUMMARY
