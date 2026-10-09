# Deployment

BugTrail is deployed **without Docker**, to either **Railway** or **our own VPS**.
Both setups run the same three pieces:

```
            app.<domain>                    api.<domain>
 Browser ──► bugtrail-web (Next.js) ──XHR──► bugtrail-api (Express + Socket.IO + email outbox worker)
     └────────────── WebSocket ────────────────────┘                    │
                                                                       MongoDB
```

> Status: this is the **target** setup. Items marked *(Phase N)* don't exist in the code yet.

## Environments

| Branch | Environment | Deploys to |
|---|---|---|
| `development` | **Staging** | `staging-app.<domain>` / `staging-api.<domain>`, with its own MongoDB database |
| `main` | **Production** | `app.<domain>` / `api.<domain>` |

Staging and production must **never share a database** or `JWT_SECRET`. On Railway, use two environments (Staging and Production) in one project, each auto-deploying from its branch.

## Rules that apply to both setups

1. **Run exactly one API instance.** Socket.IO rooms and the email outbox worker live in memory inside one process. Two instances would split chat rooms and could double-send emails. Scaling out later needs a Socket.IO adapter and a worker lock.
2. **Use a custom domain with two subdomains**, e.g. `app.bugtrail.example.com` and `api.bugtrail.example.com`.
   - The refresh token lives in an httpOnly cookie *(Phase 1)*. Because both subdomains share one site, the cookie can use `SameSite=Lax`.
   - The default `*.up.railway.app` URLs are treated as **different sites** by browsers (the domain is on the Public Suffix List). They would force `SameSite=None` plus CSRF protection, so avoid them for production.
3. **Secrets only in environment variables**, never committed. `.env.example` lists every variable.
4. **HTTPS everywhere.** Secure cookies require it.

## Option A: Railway

| Service | Setup |
|---|---|
| `bugtrail-api` | Deploy from GitHub. Railway detects Node with Nixpacks. Start command `npm start` (PM2 in the foreground). **Replicas: 1.** Set variables from `.env.example`, with `NODE_ENV=production`. |
| `bugtrail-web` | Deploy from GitHub. Build `npm run build`, start `npm start`. Set `NEXT_PUBLIC_API_URL=https://api.<domain>/v1`. |
| MongoDB | The Railway MongoDB plugin (use its private `MONGO_URL`) or MongoDB Atlas. |

- Healthcheck path: `/v1/health` *(Phase 1)*.
- Attach the custom domains in each service's **Settings → Networking**.
- Railway's GitHub auto-deploy on `main` is fine. CI (lint/test) runs separately in GitHub Actions.

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

6. Because Nginx is in front, the API sets `app.set('trust proxy', 1)` *(Phase 1)* so rate limiting and secure cookies see the real client IP and protocol.

## Release checklist
- [ ] `npm run lint` and `npm test` are green in CI
- [ ] New env variables were added on the server/Railway **before** deploying code that needs them
- [ ] Back up MongoDB before deploys that change data shape (`mongodump` or Atlas snapshot)
- [ ] After deploy: `/v1/health` is OK, login works, and a chat message arrives live in a second browser
