# VPS Production Deployment — Standard Operating Procedure

A reusable playbook for taking a Node/Express (or similar) backend + a
static-built frontend (React/Vite, etc.) from "runs on my machine" to a
hardened, production-grade deployment on a fresh Ubuntu VPS — Nginx +
Let's Encrypt SSL + a process manager + a firewall, with the app never
running as root.

This was written up after deploying **TailCircle** (Node/Express + MongoDB
Atlas + Redis + React/Vite) to a fresh Ubuntu 24.04 VPS. Every value below is
a placeholder — replace before use. Nothing here is TailCircle-specific
except the worked examples; the steps generalize to most Node-stack apps.

---

## 0. When to use this

Any time the ask is roughly: *"deploy this project to my VPS, standard
production way, with a real domain and SSL, don't run it as root."*

Works best for: Node/Express (or similar) API + a statically-built SPA
frontend, backed by a managed/external database (Atlas, RDS, etc.) so the
VPS itself stays stateless and disposable.

---

## 1. Prerequisites to gather before touching the server

Don't assume any of these — ask if not given:

| Need | Example |
|---|---|
| VPS SSH access | `ssh root@<SERVER_IP>`, root password (fresh server, nothing installed) |
| Domain name | `example.com` (user adds DNS A records when told to) |
| Certbot/Let's Encrypt notification email | `ops@example.com` |
| Deploy username preference | default to `deploy` if no preference |
| Database | confirm it's an **external managed DB** (Atlas/RDS/etc.) — never stand up a local DB on the VPS unless explicitly asked |
| Which secrets to reuse vs. regenerate | default: reuse existing third-party service credentials (payment gateway, storage, SMS, etc.) from the local `.env`; only regenerate app-internal secrets (JWT, session, feature-specific keys) if needed to satisfy a prod safety guard |
| Repo location | GitHub/GitLab URL so the server can `git clone` directly, rather than scp'ing the whole tree |

### Decisions to explicitly confirm with the user (don't assume)

Use a multiple-choice check-in (not free text) for each of these before
writing any plan:

1. **Optional heavy subsystems** — if the app has something like a
   self-hosted media/SFU server, a second domain-dependent service, etc.,
   ask whether to deploy it now or defer to a phase 2. Deferring reduces
   day-one firewall surface and blast radius.
2. **Subdomain layout** — single domain with the API under a path
   (`example.com/api`) vs. a dedicated `api.` subdomain. Path-based is
   simpler (one cert, one DNS record, same-origin CORS); subdomain is
   cleaner if the API will scale independently later.
3. **SSH hardening posture** — create a sudo deploy user + SSH key and
   *disable* root/password login (stricter), vs. create the user/key but
   *keep* password auth as a fallback (more forgiving, needs fail2ban as a
   compensating control either way).

---

## 2. Recon — read the repo before proposing anything

Before writing a plan, actually read:

- `package.json` (root, and each app if it's a monorepo) — scripts, engines
  (Node version), dependencies that hint at required services (Redis,
  a queue, a media server, etc.)
- `.env.example` / `.env` (if present) in every app — this tells you every
  external service the app depends on and which env vars are prod-sensitive
- `Dockerfile` / `docker-compose*.yml` if present — usually the most
  authoritative source for the exact runtime version and startup command
  the maintainers intend for production
- Any `DEPLOYMENT.md` / `README` deployment section — go-live checklists,
  health-check endpoints, graceful-shutdown behavior
- **The app's own config/env validation code** (e.g. `config/env.js`) —
  look specifically for a production boot guard: code that throws/exits if
  `NODE_ENV=production` and some var is missing, a placeholder, or points
  at `localhost`. This is the single most common way a deployment silently
  fails after everything else looks right. Know what it checks *before* you
  flip `NODE_ENV=production`, so you're not surprised by a crash-on-boot.
- `git remote -v` — confirm there's a pushable/clonable origin so the server
  can `git clone` + future `git pull`, instead of scp'ing the whole tree
- Route/controller code for anything the user will need later (e.g. "what's
  the exact request body for endpoint X") — cheaper to note in passing
  during recon than to re-explore later

Write a short plan (use plan mode) summarizing: what's being deployed, the
architecture, exactly which env values change for production and why, and
the DNS records that will be needed. Get explicit sign-off before touching
the server.

---

## 3. Windows-specific tooling note

If working from a Windows machine without WSL, the OpenSSH client has no
built-in way to do non-interactive password auth (no `sshpass`, and
`plink` usually isn't installed either). The fix:

```bash
python -m pip install --quiet paramiko
```

Write a tiny helper (`ssh_root.py`) that opens a paramiko `SSHClient` with
password auth and streams a heredoc'd command's stdout/stderr back. Use this
**only** for the very first bootstrap step (creating the deploy user and
installing its SSH key) — everything after that goes over key-based
`ssh`/`scp` as normal, no more password plumbing needed.

Two gotchas hit during this session, worth building in from the start:

- **Console encoding**: Windows' default `cp1252` console encoding chokes on
  UTF-8 box-drawing/arrow characters that `apt`/`npm` print. Add
  `sys.stdout.reconfigure(encoding="utf-8", errors="replace")` at the top of
  the helper script.
- **Dropped connections during `apt upgrade`**: if the upgrade touches
  `openssh-server`, sshd may restart mid-session and kill your channel. The
  command likely still completed — don't treat a broken pipe as a failed
  install; reconnect and check actual state (`dpkg -l | grep ...`) before
  retrying anything.

---

## 4. Execution phases

### Phase 0 — OS baseline (as root, one-time)
```bash
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a          # auto-restart services, no interactive prompt
timedatectl set-timezone <TZ>       # e.g. Asia/Kolkata
apt-get update -y
apt-get -o Dpkg::Options::="--force-confold" upgrade -y
apt-get install -y curl git unzip build-essential ca-certificates gnupg ufw fail2ban
```

### Phase 0b — Non-root deploy user
```bash
useradd -m -s /bin/bash -G sudo deploy
echo "deploy:<GENERATED_PASSWORD>" | chpasswd

# SSH key generated LOCALLY first: ssh-keygen -t ed25519 -f ./deploy_key -N "" -C "deploy@example.com"
mkdir -p /home/deploy/.ssh
echo "<PUBLIC_KEY_CONTENTS>" > /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```
Verify key login works (`ssh -i ./deploy_key deploy@<IP> whoami`) **before**
relying on it for anything else.

### Phase 0c — Firewall + brute-force protection
```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

cat > /etc/fail2ban/jail.local <<'CONF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port    = ssh
CONF
systemctl enable --now fail2ban
```
If password auth is being kept enabled (per the user's SSH-hardening
choice), fail2ban here is not optional — it's the compensating control.

### Phase 1 — Runtime stack (as root)
```bash
# Node LTS matching the app's Dockerfile/engines field
curl -fsSL https://deb.nodesource.com/setup_<MAJOR>.x | bash -
apt-get install -y nodejs
npm install -g pm2

apt-get install -y nginx
systemctl enable --now nginx

apt-get install -y redis-server        # only if the app actually uses Redis
systemctl enable --now redis-server
grep '^bind' /etc/redis/redis.conf     # confirm 127.0.0.1 only — never expose it

apt-get install -y certbot python3-certbot-nginx
```

### Phase 2 — App deployment (as `deploy`)
```bash
sudo mkdir -p /var/www/<app> && sudo chown deploy:deploy /var/www/<app>
git clone <REPO_URL> /var/www/<app>

cd /var/www/<app>/backend && npm ci --omit=dev
cd /var/www/<app>/frontend && npm ci && npm run build
```
Upload gitignored secrets separately (they're never in the repo):
```bash
scp -i <key> ./backend.env.production deploy@<IP>:/var/www/<app>/backend/.env
scp -i <key> ./service-account.json   deploy@<IP>:/var/www/<app>/backend/service-account.json
ssh  -i <key> deploy@<IP> "chmod 600 /var/www/<app>/backend/.env /var/www/<app>/backend/service-account.json"
```

**Env values that typically change for production** (see the app's own
`.env.example` for the full list — this is the general pattern, not
exhaustive):
- `NODE_ENV=production`
- `CORS_ORIGIN` → the real domain(s), no `localhost`
- Any `VITE_*`/frontend API base URLs → the real domain, not `localhost`
- Anything the production boot guard (found during recon, §2) demands —
  generate real secrets even for subsystems being deferred to a later
  phase, pointed at the eventual real hostname, so the guard passes without
  touching app code (see §6 "Deferring an optional subsystem")

Everything else (database URI, third-party API keys) — copy verbatim from
local `.env` unless told otherwise.

Start it:
```bash
cd /var/www/<app>/backend
pm2 start src/server.js --name <app>-api --time
pm2 save
curl 127.0.0.1:5000/health          # or whatever the liveness route is
curl 127.0.0.1:5000/health/ready    # readiness — confirms DB connectivity
```

Persist PM2 across reboots (run as root, targets the `deploy` user):
```bash
env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy
# then, back as deploy:
pm2 save
```

### Phase 3 — Nginx + domain + TLS

Template server block (adjust upstream port, health paths, websocket path):
```nginx
upstream app_api {
    server 127.0.0.1:5000;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;

    root /var/www/<app>/frontend/dist;
    index index.html;
    client_max_body_size 15m;

    location /api/ {
        proxy_pass http://app_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {              # only if the app uses websockets
        proxy_pass http://app_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }

    location = /health { proxy_pass http://app_api; }
    location = /health/ready { proxy_pass http://app_api; }

    location /assets/ {                  # long-cache hashed build output
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / { try_files $uri /index.html; }   # SPA fallback

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
}
```
```bash
mv nginx.conf /etc/nginx/sites-available/<domain>
ln -sf /etc/nginx/sites-available/<domain> /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

**Pause here.** Tell the user the exact DNS records to add:
```
A   @     <SERVER_IP>
A   www   <SERVER_IP>
```
Confirm propagation (`nslookup <domain>`) before issuing the cert — Certbot
will fail the HTTP-01 challenge if DNS isn't pointed yet.

```bash
certbot --nginx -d example.com -d www.example.com \
  -m <EMAIL> --agree-tos --redirect -n
nginx -t && systemctl reload nginx
```
Certbot installs its own renewal systemd timer automatically — verify with
`systemctl list-timers | grep certbot`.

### Phase 4 — Verification
```bash
curl -I https://example.com/                    # 200, valid cert
curl https://example.com/health                 # liveness
curl https://example.com/health/ready            # readiness (DB up)
curl -o /dev/null -w '%{http_code}\n' http://example.com/   # 301 → https
```
Also: `pm2 status`, `sudo ufw status`, `sudo fail2ban-client status sshd`.

---

## 5. The update/deploy script

Drop this at the project root on the server (`/var/www/<app>/deploy.sh`) so
every future update is one command, regardless of which user runs it:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/<app>"
BRANCH="main"

# App files (node_modules, PM2 process, git repo) are owned by the deploy
# user. Re-exec as that user instead of failing halfway through if this was
# run as root.
if [ "$(whoami)" != "deploy" ]; then
  echo "==> Re-running as deploy user"
  exec su - deploy -c "bash $APP_DIR/deploy.sh"
fi

cd "$APP_DIR"

# Needed if this is ever invoked by a different user than the repo owner —
# git otherwise refuses to touch it ("dubious ownership").
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

echo "==> [1/5] Fetching latest code from origin/$BRANCH"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "    now at: $(git log -1 --oneline)"

echo "==> [2/5] Backend: installing dependencies"
cd "$APP_DIR/backend"
npm ci --omit=dev

echo "==> [3/5] Frontend: installing dependencies & building"
cd "$APP_DIR/frontend"
npm ci
npm run build

echo "==> [4/5] Restarting backend (PM2)"
pm2 restart <app>-api --update-env

echo "==> [5/5] Health check"
sleep 2
curl -fsS http://127.0.0.1:5000/health && echo
curl -fsS http://127.0.0.1:5000/health/ready && echo

echo "✅ Deploy complete — $(date)"
pm2 status <app>-api
```

Notes baked in from real failures:
- `git reset --hard` (not `pull`) so the server always matches GitHub exactly,
  even after a force-push. Untracked files (`.env`, build output,
  `node_modules`) are never touched by this.
- The self-elevation block exists because running the raw commands as root
  breaks two ways: git refuses to touch a `deploy`-owned repo, and root has
  its own empty PM2 process list that's never heard of the app's process —
  `pm2 restart <app>-api` as root would just fail with "process not found."
- `npm ci` runs every deploy unconditionally (simpler and safer than
  diffing lockfiles, and cheap for small-to-medium apps).

Test-run it once as **both** `root` and `deploy` before handing it off, and
confirm the site stays up throughout.

---

## 6. Deferring an optional subsystem

If part of the stack is being deferred to a later phase (a self-hosted media
server, a second service, etc.) but the app's production boot guard (found
during recon) demands it look configured:

1. Generate the **real** secrets for it now (don't use dev/placeholder
   values — some guards specifically reject known dev keys).
2. Point its URL(s) at the **real eventual hostname** under the domain, even
   though nothing is listening there yet (e.g. `wss://media.example.com`).
3. This satisfies the guard with zero app-code changes. The deferred
   feature itself simply won't function until phase 2 stands up the real
   service at that hostname — everything else works normally.
4. Tell the user clearly what won't work yet and why.

---

## 7. Handoff — what to give the user at the end

- Server IP, domain, SSH access (key path + fallback password if kept)
- `deploy` user credentials
- Exact path to the app on the server, and the deploy script command
- A clear list of which env values differ from their local `.env` and why
- What was deferred (if anything) and what's needed to complete it later
- Any pre-existing bugs noticed in the repo along the way that aren't yours
  to silently fix (report them, don't fix without asking)

---

## 8. Master prompt — paste this to kick off a new deployment

Copy, fill in the placeholders, and paste as the first message in a fresh
session in the target project's repo:

```
I want to deploy this project to a fresh VPS, standard industry-grade
production setup — no shortcuts, don't run the app as root.

Server:
- ssh root@<SERVER_IP>
- password: <ROOT_PASSWORD>
- Brand new Ubuntu server, nothing installed yet

Requirements:
- Create a dedicated non-root sudo user for all deployment/runtime work
- Database: use my existing <MongoDB Atlas / managed Postgres / etc.>
  connection string from my local .env — do NOT stand up a local database
  on the server
- Reuse all other existing service credentials (payment, storage, email,
  SMS, etc.) from my local .env as-is
- Domain: <DOMAIN> — tell me exactly what DNS records to add and when
- Certbot/Let's Encrypt email: <EMAIL>
- Set up: Nginx reverse proxy, free SSL via Certbot with auto-renewal,
  a process manager for the backend (PM2 or systemd — your call, tell me
  which and why), a firewall (only 22/80/443 open), and fail2ban on SSH
- Give me one deploy.sh script at the end so every future update is just
  `bash deploy.sh` — pulls latest git, reinstalls deps, rebuilds the
  frontend, restarts the backend. Make it work whether I run it as root or
  as the deploy user.
- If anything in the app's own code will refuse to boot in production
  (missing config, placeholder secrets, etc.), find that out during your
  recon and handle it — don't let me find out by way of a crash.

Process:
- First explore the repo (package.json, .env.example, Dockerfile,
  DEPLOYMENT.md if present) to understand the actual stack.
- Then make a plan and confirm with me anything you're not sure about
  (subdomain layout, whether to defer any optional heavy subsystems,
  SSH hardening posture) — don't assume, ask.
- Then execute, verifying each phase before moving to the next.
- At the end, give me: server access details, the deploy user's
  credentials, and a clear list of anything that differs from my local
  .env and why.
```

---

*Adapt freely — this captures the shape of the process, not a rigid script.
The one constant that should never change: read the app's own code and env
config before proposing a plan, and never run the application as root.*
