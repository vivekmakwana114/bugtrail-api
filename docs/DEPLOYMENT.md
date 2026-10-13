# Deployment

BugTrail is deployed **without Docker**, to either **Railway** or **our own VPS**.
Both setups run the same three pieces:

```
            app.<domain>                    api.<domain>
 Browser ──► bugtrail-web (Next.js) ──XHR──► bugtrail-api (Express + Socket.IO + email outbox worker)
     └────────────── WebSocket ────────────────────┘                    │
                                                                       MongoDB
```

Plan (2026-10-13): **Railway first, for testing** (default `*.up.railway.app` URLs are fine), then **our own VPS** for production.

## Environments

| Branch | Environment | Deploys to |
|---|---|---|
| `development` | **Staging** | `staging-app.<domain>` / `staging-api.<domain>`, with its own MongoDB database |
| `main` | **Production** | `app.<domain>` / `api.<domain>` |

Staging and production must **never share a database** or `JWT_SECRET`. On Railway, use two environments (Staging and Production) in one project, each auto-deploying from its branch.

## Rules that apply to both setups

1. **Run exactly one API instance.** Socket.IO rooms and the email outbox worker live in memory inside one process. Two instances would split chat rooms and could double-send emails. Scaling out later needs a Socket.IO adapter and a worker lock.
2. **The refresh cookie needs no configuration.** With `NODE_ENV=production` it is `Secure` + `SameSite=None`, so it works both on two default `*.up.railway.app` URLs (different sites to a browser, because that domain is on the Public Suffix List) and on `app.<domain>` + `api.<domain>`. Because `None` lets other sites' requests carry the cookie, the refresh and logout routes reject any `Origin` that isn't `CLIENT_URL`. So **`CLIENT_URL` must be the web app's exact origin** (`https://…`, no trailing path), or sign-in won't survive a page reload.
3. **Secrets only in environment variables**, never committed. `.env.example` (in both repos) lists every variable in three sections, **Development**, **Staging (Railway)** and **Production (VPS)**: copy the section you need, without the `# `.
4. **HTTPS everywhere.** Secure cookies require it.
5. **Email is sent only when `SMTP_HOST` is set.** Without it the API logs each email instead, which is fine for a first Railway test.

## Option A: Railway

| Service | Setup |
|---|---|
| `bugtrail-api` | Deploy from GitHub. Railway detects Node with Nixpacks. Start command `npm start` (PM2 in the foreground). **Replicas: 1.** Variables: `NODE_ENV=production`, `MONGODB_URL`, `JWT_SECRET` (long and random), `CLIENT_URL` (the web service's URL), and `SMTP_*` only when you want real email. Not `DNS_SERVERS`. |
| `bugtrail-web` | Deploy from GitHub. Build `npm run build`, start `npm start`. Set `NEXT_PUBLIC_API_URL=https://<api-service-url>/v1` **before the first build**: Next.js bakes it into the bundle, so changing it later needs a rebuild. |
| MongoDB | The Railway MongoDB plugin (private `MONGO_URL` for the API) or MongoDB Atlas. |

- Healthcheck path: `/v1/health` (checks the database connection).
- **Create the Admin** once, from your machine: install the Railway CLI, `railway link` to the API service, then `railway run npm run seed`. It runs the seed locally with Railway's variables and asks for the email and password as usual. The database must be reachable from your machine: Atlas, or the Railway MongoDB plugin's **public** URL (temporarily set `MONGODB_URL` to it for this one command).
- Custom domains are optional for testing; attach them later in each service's **Settings → Networking** and update `CLIENT_URL` / `NEXT_PUBLIC_API_URL` (then rebuild the web).
- Railway's GitHub auto-deploy is fine. CI (lint/test) runs separately in GitHub Actions.

## Option B: own VPS (Ubuntu)

1. Install Node 20 LTS, PM2 (`npm i -g pm2`), Nginx, and Certbot. Use MongoDB Community bound to `127.0.0.1` **with auth enabled**, or point to Atlas.
2. Clone both repos, `npm ci`, and create `.env` files (permissions `600`).
3. API: `pm2 start ecosystem.config.json` (1 instance). Web: `npm run build && pm2 start npm --name bugtrail-web -- start`.
4. `pm2 save && pm2 startup` so both start again after a reboot.
5. Nginx: one server block per subdomain, with TLS from `certbot --nginx`. The API block **must forward WebSocket upgrades**:

```nginx
server {
  server_name api.bugtrail.example.com;
  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;     # Socket.IO
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

6. Because Nginx is in front, the API sets `app.set('trust proxy', 1)` in production so rate limiting and secure cookies see the real client IP and protocol.
7. Create the Admin on the server: `npm run seed` in an SSH session (it asks for the email and password).

## Release checklist
- [ ] `npm run lint` and `npm test` are green in CI
- [ ] New env variables were added on the server/Railway **before** deploying code that needs them
- [ ] Back up MongoDB before deploys that change data shape (`mongodump` or Atlas snapshot)
- [ ] After deploy: `/v1/health` is OK, login works, and a chat message arrives live in a second browser
