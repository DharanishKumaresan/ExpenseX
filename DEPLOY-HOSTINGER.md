# Deploying ExpenseX on Hostinger

## Read this first: which Hostinger plan works

ExpenseX is a Next.js app. Every page is rendered on a server against the
signed-in session, every mutation is a React Server Action, data lives in
**PostgreSQL**, and `/api/realtime` holds a long-lived Server-Sent Events
connection open.

That means it needs **a Node.js process you control and a PostgreSQL database**.

| Hostinger product | Works? | Why |
| --- | --- | --- |
| **VPS (KVM 1 and up)** | **Yes — use this** | Root access: you install Node, PostgreSQL and Nginx yourself. |
| Cloud / Business / Premium **shared Web Hosting** | No | LiteSpeed + PHP only. No persistent Node process, and MySQL rather than PostgreSQL. |
| Website Builder | No | Static sites only. |

If you are currently on shared hosting, you need to add a VPS plan (or point
the domain you already own at a VPS). **KVM 1** (1 vCPU / 4 GB RAM) comfortably
runs the app plus its database.

Everything below assumes **Ubuntu 24.04** on a Hostinger VPS, which is what
Hostinger's hPanel offers as the default OS template.

---

## 1. Build the bundle on your machine

```bash
npm run package
```

This writes `dist/expensex-deploy.zip` plus a `.sha256` next to it.

The bundle contains the source, the Prisma migrations, the PWA assets and the
deploy configs. It deliberately does **not** contain `node_modules` or `.next`:
Prisma compiles a platform-specific query engine, so a `.next` folder built on
Windows will not start on a Linux VPS. The build runs once on the server, where
the correct engine is fetched. It costs about a minute.

It also never contains your `.env` — you write that on the server.

---

## 2. Create the VPS and point your domain at it

In hPanel:

1. **VPS → Create** → choose KVM 1 or larger → **Ubuntu 24.04** (plain, no
   panel) → set a root password → note the IPv4 address.
2. **Domains → DNS Zone** for your domain:
   - `A` record, name `@`, value `<your VPS IPv4>`
   - `A` record, name `www`, value `<your VPS IPv4>`
3. Wait for DNS to propagate. Check with `nslookup yourdomain.com` — do not
   move on to the certificate step until it answers with the VPS address, or
   Let's Encrypt will fail.

---

## 3. Upload the bundle

From your machine:

```bash
scp dist/expensex-deploy.zip root@YOUR_VPS_IP:/root/
```

On Windows without `scp`, hPanel's **Browser terminal** or any SFTP client
(FileZilla, WinSCP) to `/root/` does the same job.

Then connect:

```bash
ssh root@YOUR_VPS_IP
```

---

## 4. Provision the server

```bash
apt-get update -y && apt-get install -y unzip
mkdir -p /tmp/expensex && unzip -q /root/expensex-deploy.zip -d /tmp/expensex
bash /tmp/expensex/deploy/setup-vps.sh yourdomain.com
```

This installs Node 22, PostgreSQL, Nginx, certbot and `ufw`; creates the
`expensex` database, role and system user; and prints a summary containing a
**freshly generated database password and session secret**. Copy that summary
somewhere safe before you close the terminal — it is not written to disk.

---

## 5. Install the app

```bash
# Move the unpacked files into place
rsync -a /tmp/expensex/ /var/www/expensex/
chown -R expensex:expensex /var/www/expensex
cd /var/www/expensex
```

Create `/var/www/expensex/.env` with the three values from the step 4 summary:

```bash
nano /var/www/expensex/.env
```

```ini
DATABASE_URL="postgresql://expensex:THE_PASSWORD_FROM_STEP_4@127.0.0.1:5432/expensex?schema=public"
SESSION_SECRET="THE_SECRET_FROM_STEP_4"
APP_URL="https://yourdomain.com"
```

Lock it down, then install, migrate and build:

```bash
chown expensex:expensex /var/www/expensex/.env
chmod 600 /var/www/expensex/.env

sudo -u expensex npm ci
sudo -u expensex npx prisma migrate deploy
sudo -u expensex npm run build
```

`npm run build` takes 1–3 minutes on a KVM 1. If it is killed for running out
of memory, add swap first:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## 6. Run it as a service

```bash
cp /var/www/expensex/deploy/expensex.service /etc/systemd/system/expensex.service
systemctl daemon-reload
systemctl enable --now expensex
systemctl status expensex
```

Check it is answering locally before putting Nginx in front:

```bash
curl -I http://127.0.0.1:3000/login   # expect HTTP/1.1 200 OK
```

Logs, whenever you need them:

```bash
journalctl -u expensex -f
```

---

## 7. Nginx and HTTPS

```bash
cp /var/www/expensex/deploy/nginx/expensex.conf /etc/nginx/sites-available/expensex.conf
sed -i 's/expensex.example.com/yourdomain.com/g' /etc/nginx/sites-available/expensex.conf
ln -sf /etc/nginx/sites-available/expensex.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

certbot --nginx -d yourdomain.com -d www.yourdomain.com
nginx -t && systemctl reload nginx
```

**HTTPS is not optional.** The session cookie is issued with the `Secure` flag
in production, so over plain HTTP the browser accepts the login response and
then refuses to send the cookie back — sign-in appears to succeed and then
bounces you straight back to the login page. If you see that, your certificate
is missing or `X-Forwarded-Proto` is not reaching the app.

The supplied Nginx config already handles two things that are easy to get
wrong:

- `proxy_buffering off` on `/api/realtime`, without which the Server-Sent
  Events feed is buffered and the shared-workspace live updates never arrive.
- `proxy_set_header X-Forwarded-Proto $scheme`, which is how Next.js knows it
  is behind TLS.

Certbot installs its own renewal timer; confirm with `systemctl list-timers | grep certbot`.

---

## 8. Create your account

Open `https://yourdomain.com/signup` and register. The first account is an
ordinary account — there is no admin tier.

If you want the demo data instead:

```bash
cd /var/www/expensex && sudo -u expensex npm run db:seed
```

That creates `demo@expensex.app` / `expensex-demo-2026`. **Delete those
accounts or change their passwords before the site is public.**

---

## 9. Verify the PWA

On your phone, open `https://yourdomain.com`:

- **Android / Chrome** — the browser offers "Install app", or use ⋮ → *Add to
  Home screen*. **Settings → Install** inside the app has a button too.
- **iPhone / Safari** — Share → *Add to Home Screen*. iOS has no install
  prompt API, so this is the only route; the app's Settings page says so.

Installed, it opens full screen with no browser chrome, keeps the olive/sage
status bar, and offers *Add an expense*, *Transactions*, *Budget* and *Shared*
as long-press shortcuts.

The service worker caches the build output (JS, CSS, fonts, icons) so repeat
visits are fast, and shows a styled offline page when the network drops. It
**never** caches a page, an API response or a server action: every page is full
of one person's money, and a cached page would survive sign-out and be served
to whoever opens the browser next.

Confirm it registered: DevTools → Application → Service Workers should show
`/sw.js` as *activated*, and Cache Storage should hold `expensex-static-v1` and
`expensex-assets-v1` — and no HTML documents.

---

## Deploying an update

```bash
# on your machine
npm run package
scp dist/expensex-deploy.zip root@YOUR_VPS_IP:/root/

# on the VPS
systemctl stop expensex
unzip -qo /root/expensex-deploy.zip -d /var/www/expensex
chown -R expensex:expensex /var/www/expensex
cd /var/www/expensex
sudo -u expensex npm ci
sudo -u expensex npx prisma migrate deploy
sudo -u expensex npm run build
systemctl start expensex
```

`unzip -o` overwrites in place and leaves `.env` alone, because `.env` is not
in the bundle.

Browsers pick the new build up on the next navigation: the service worker
fetches `sw.js` with `Cache-Control: no-store`, and every asset filename is
content-hashed, so there is no stale-chunk window to manage.

---

## Backups

The database is the only thing that cannot be rebuilt from the bundle.

```bash
# Nightly dump at 02:30, keeping 14 days
mkdir -p /var/backups/expensex
cat > /etc/cron.d/expensex-backup <<'CRON'
30 2 * * * postgres pg_dump -Fc expensex > /var/backups/expensex/expensex-$(date +\%F).dump 2>/dev/null
40 2 * * * root find /var/backups/expensex -name '*.dump' -mtime +14 -delete
CRON
```

Restore with `pg_restore -d expensex -c /var/backups/expensex/<file>.dump`.

Hostinger's own VPS snapshots are a second, coarser layer — take one before
every upgrade.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Login redirects straight back to `/login` | No HTTPS, or `X-Forwarded-Proto` missing | Finish step 7; the cookie is `Secure` in production |
| `Invalid environment configuration` on boot | `.env` missing, or `SESSION_SECRET` under 32 chars | Re-check step 5; `journalctl -u expensex -n 50` names the field |
| 502 Bad Gateway | The app is not running | `systemctl status expensex`, then `journalctl -u expensex -n 100` |
| Shared workspace never updates live | SSE buffered by the proxy | Confirm `proxy_buffering off` under `location /api/realtime` |
| `npm run build` killed | Out of memory on KVM 1 | Add the 2 GB swap file from step 5 |
| "Install app" never appears | Not served over HTTPS, or already installed | PWA install requires a valid certificate |
| Prisma "engine not found" | `.next` was copied from another OS | Never ship `.next`; build on the server |

---

## What is in the bundle

```
src/                 application code
prisma/              schema, migrations, seed
public/              PWA manifest, service worker, icons, offline page
scripts/             setup, local database, icon and packaging scripts
deploy/
  setup-vps.sh       one-shot Ubuntu provisioning
  expensex.service   systemd unit
  ecosystem.config.cjs  PM2 alternative
  nginx/expensex.conf   reverse proxy with SSE and TLS
tests/               unit tests (npm test)
package-lock.json    the exact dependency tree the build was verified against
```
