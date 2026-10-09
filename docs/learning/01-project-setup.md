# 01: Project setup (Phase 0, backend)

## What we did
| Change | Why |
|---|---|
| Moved `server-development-main/*` to the repo root | Tools assume `package.json` sits next to `.git`. Husky (git hooks) was **silently broken** in the old layout because `npm run prepare` ran in a subfolder. CI and Railway would also need a custom "root directory". |
| Deleted Docker, `docker-compose*`, `.travis.yml`, `bin/createNodejsApp.js` | Decision: no Docker. Travis was the boilerplate's CI. The `bin` script was the boilerplate's own project generator. Dead config misleads teammates and AI tools. |
| Renamed to `bugtrail-api`, `private: true`, `UNLICENSED` | The product name everywhere. `private` blocks an accidental `npm publish`. MIT came from the open-source template. |
| API port 3000 → **5000** | Next.js dev also uses 3000, so both locally would collide. |
| Prettier 3 reformat (trailing commas) | Prettier 3 changed the default `trailingComma` from `es5` to `all`. The code was formatted by v2, so lint failed on formatting only. |
| `import { jest } from '@jest/globals'` in tests | **In ESM mode, Jest doesn't inject the `jest` global.** The ESM migration missed this, and 23 tests were failing. Now **106/106 pass**. |
| `@jest/globals` added to devDependencies | It worked only as a hidden dependency of `jest`. ESLint's `import/no-extraneous-dependencies` caught that we import a package we never declared. |
| GitHub Actions `ci.yml` (lint for now) | Tests join CI in Phase 1, once they run on an in-memory MongoDB. |
| `docs/PROJECT_PLAN.md`, `docs/DEPLOYMENT.md` | Decisions live with the code and get reviewed in PRs. |

## Concepts worth knowing

### 1. Layered architecture (already in the boilerplate, and we keep it)
```
HTTP request
   │
   ▼
routes/v1/*.route.js     which URL + which middlewares, in order
   │  validate(schema)   Joi: reject bad input before any logic runs (400)
   │  auth()/authorize() who are you? (401) are you allowed? (403)   (Phase 1)
   ▼
controllers/*.js         thin: read req → call service → send res
   ▼
services/*.js            business rules (the ONLY place that talks to models)
   ▼
models/*.js              Mongoose schema = shape + indexes + hooks
```
**Why services own the rules:** the same rule ("a developer can't mark Pass") must apply whether the call comes from REST, a socket event, or a seed script. If the rule lived in a controller, the socket path would skip it.

### 2. Errors flow one way
Anything can `throw new ApiError(status, message)`. `catchAsync` forwards async errors to `next(err)`, then `errorConverter` turns unknown errors into `ApiError`s, then `errorHandler` formats the JSON. One place decides what the client sees, so stack traces never leak in production.

### 3. Config is validated at boot
`src/config/config.js` validates `process.env` with Joi **before the app starts**. A missing `MONGODB_URL` crashes at startup with a clear message instead of failing on the first request at 2 a.m. That's why the rule is: never read `process.env` anywhere else.

## Try it yourself
1. `npm run dev`, then open `http://localhost:5000/v1/docs`. Find the existing auth endpoints in Swagger.
2. Remove `JWT_SECRET` from your `.env` and start the server. Read the error, then put it back. That's config validation working.
3. In `tests/unit/middlewares/error.test.js`, delete the first-line `@jest/globals` import and run `npm test`. You'll see the exact ESM failure we fixed.
