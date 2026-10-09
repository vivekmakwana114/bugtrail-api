# BugTrail API

Backend for **BugTrail**, Invennico's internal bug reporting and QA tracking panel.
QA reports tickets against projects, developers fix them, QA verifies them (Pass / Failed), and Admin controls what every role can do.

> Full product and architecture plan: [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)
> Learning notes for each build phase: [`docs/learning/`](docs/learning)
> Deployment guide (Railway / VPS): [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

## Tech stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20+ (ES Modules) |
| HTTP | Express 4 |
| Database | MongoDB + Mongoose 8 (the only infrastructure dependency) |
| Auth | JWT access tokens + refresh tokens (Passport JWT) |
| Validation | Joi |
| Realtime | Socket.IO (bug chat + notifications), added in Phase 5 |
| Email | Nodemailer via a MongoDB-backed outbox (no Redis), added in Phase 5 |
| Docs | Swagger (OpenAPI 3) at `/v1/docs` in development |
| Tests | Jest + Supertest |
| Process manager | PM2 (single instance) |

There's no Docker and no Redis. You only need Node.js and MongoDB.

## Getting started (Windows)

### 1. Prerequisites
- **Node.js 20+**: `node -v`
- **MongoDB**, either:
  - [MongoDB Community Server](https://www.mongodb.com/try/download/community) installed as a Windows service (it listens on `mongodb://127.0.0.1:27017`), or
  - a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (paste its connection string into `MONGODB_URL`).

### 2. Install and configure
```bash
npm install
cp .env.example .env      # Command Prompt: copy .env.example .env
```
Then edit `.env`. At minimum set `MONGODB_URL` and a long random `JWT_SECRET`.

### 3. Run
```bash
npm run dev       # nodemon, http://localhost:5000/v1
```
API docs (development only): http://localhost:5000/v1/docs

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start with nodemon (auto-restart on change) |
| `npm start` | Start with PM2 in the foreground (production) |
| `npm test` | Run the Jest test suite |
| `npm run coverage` | Tests with a coverage report |
| `npm run lint` / `lint:fix` | ESLint (airbnb-base + security + prettier) |
| `npm run prettier:fix` | Format all JS files |

A Husky pre-commit hook runs ESLint on staged files.

## Project structure

```
src/
  config/        env validation, logger, passport, (later) permission catalog
  controllers/   thin HTTP layer: read req, call a service, send res
  docs/          Swagger definitions
  middlewares/   auth, validation, error handling, rate limiting
  models/        Mongoose schemas + plugins (paginate, toJSON)
  routes/v1/     route definitions, wired to validation + auth + controllers
  services/      business logic (the only layer that touches models)
  utils/         ApiError, catchAsync, pick
  validations/   Joi schemas per route
  app.js         Express app (middleware stack)
  index.js       entry point: DB connection + HTTP server
tests/           unit + integration tests, fixtures
docs/            plan, deployment, learning notes
```

**How a request flows:** `route → validate(Joi) → auth/authorize → controller → service → model`. Errors thrown anywhere become an `ApiError` and are formatted by the error middleware.

## Conventions
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
- Every route has a Joi validation schema.
- Controllers stay thin. Business rules live in services.
- Read config from `src/config/config.js` and never from `process.env` directly.

## Branching & releases

```
feature/* ──PR──► development ──PR──► main
                  (staging)           (production)
```

- **`main`**: production. Only receives merges from `development`. Never commit directly.
- **`development`**: staging. Feature branches merge here through a PR, with CI green.
- **Feature branches**: branch off `development`, named by type: `feature/bug-chat`, `fix/login-cookie`, `chore/ci-tests`.
- Releasing = open a PR `development → main`. Hotfixes branch off `main` as `hotfix/*`, merge into `main`, then back into `development`.
- Commits follow Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`).
