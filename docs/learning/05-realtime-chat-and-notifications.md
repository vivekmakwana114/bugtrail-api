# 05: Realtime, chat, notifications and the email outbox (Phase 5, backend)

## What we did
| Change | Why |
|---|---|
| Socket.IO on the same port as the API (`src/sockets/`) | Live chat, live status changes and the notification bell without polling. |
| Handshake auth with the access token; a `user:<id>` room per user | Notifications reach every tab of that user, and nobody else. |
| `bug:join` checks project scope with the same `getBugOrThrow` as REST | A socket can't see more than the REST API would show. |
| Chat: REST to write, sockets to broadcast | The database stays the source of truth. See concept 1. |
| Cursor paging for messages (`?before=<id>`) | New messages arriving don't shift pages. See concept 3. |
| `notify()`: in-app always, email only when `sendEmail` is true, never to the actor | One place for the notification rules. |
| EmailOutbox + worker (atomic claim, retries with backoff, 5 attempts) | No Redis needed, and SMTP never slows a request. See concept 4. |
| Reset-password and account approved/rejected emails go through the outbox | One email path. Approval emails are always sent. |
| Sockets dropped on suspend, role change, removal from a project, delete | A socket joined earlier can't keep streaming data you've lost access to. See concept 2. |
| `npm run realtime:listen` | Watch the live side while you click through Postman. |

## The flow: QA posts a chat message
```
POST /v1/bugs/:id/messages  { body, mentions }         (QA)
   │
auth() → authorize('chat:send') → validate()
   ▼
messageService.sendMessage
   getBugOrThrow(qa, id)            same scope as REST                  ── 404
   mentions ∩ project members       others silently ignored
   BugMessage.create(...)           ① saved
   emitToBug → room bug:<id>        ② 'message:new' to everyone with the bug open
   getUserIdsViewingBug(id)         who's in the room right now
   notify(mentioned)                ③ bell: bug_mentioned
   notify(assignee, reporter)          bell: bug_message
                                       (minus the sender, minus viewers, minus the mentioned)
   ▼
201 { message }                      the sender's own UI uses this response
```

## Concepts worth knowing

### 1. Write through REST, broadcast through sockets
Socket.IO can carry writes ("send this message"), but then you'd rebuild validation, permissions, errors and retries on a second channel. Instead, every change goes through the REST API you already secured, and the socket only **announces** what was saved. If a client was offline, nothing is lost: on reconnect it loads the latest page over REST. The socket is a doorbell, not the mailbox.

### 2. A socket is a long-lived session: check access when it matters
The token is checked once, at the handshake. After that the socket can stay open for hours, longer than the 30-minute token. Two defences:
- `bug:join` re-reads the user from the DB (current role and status) and runs the normal scope check.
- When access changes (suspend, role change, removed from a project, delete), the server **disconnects all of that user's sockets** (`disconnectUser`). The web app reconnects with a fresh token and re-joins only what it may still see.

### 3. Cursor pagination
Page numbers break in a live chat. You load page 1 (the newest 30), three new messages arrive, and page 2 now starts three messages earlier, so you see duplicates. A cursor says "30 messages **older than message X**", which doesn't move when new ones arrive. ObjectIds grow over time, so `_id < before` is "older than", and the `{bug, _id}` index makes it cheap. Asking for `limit + 1` tells us whether an older page exists without a count query.

### 4. The outbox pattern (why no Redis/BullMQ)
Sending email inside the request means the user waits for SMTP, and if SMTP is down the request fails even though the bug was saved. So the request only **inserts a row** (fast, and part of our own database), and a worker sends it later:
- **Atomic claim:** `findOneAndUpdate({status: 'pending', due}, {status: 'sending'})`. If two workers ever run, only one gets each row: no double sends.
- **Retries with backoff:** 30s, 1m, 2m, 4m, then `failed` with `lastError`, so you can see what went wrong.
- **Crash safety:** a row stuck in `sending` for 5 minutes is claimed again. That makes delivery *at-least-once*: a rare duplicate rather than a lost reset link.

A queue like BullMQ gives the same guarantees, but needs Redis. At our volume, MongoDB (which we already run) is enough. Revisit it when you have several API instances or thousands of emails a minute.

### 5. Side effects must not undo the main action
By the time we notify, the bug change is saved. If `notify()` threw, the client would get a 500 and think the change failed, then retry it. So `notify()` logs its own errors and never throws. The same goes for account emails. The rule: **once the source of truth is written, follow-up work reports its failures, it doesn't propagate them.**

### 6. One process, on purpose
Rooms live in the API process's memory, and the worker runs inside it. Two instances would split rooms (a message posted on instance A never reaches a socket on B) and run two workers (safe thanks to the atomic claim, but pointless). That's why PM2 runs `instances: 1` (see `docs/DEPLOYMENT.md`). Scaling out later means adding the Socket.IO Redis adapter. That's a deliberate trade, not an accident.

### 7. Designed emails, and why they look old-fashioned inside (2026-10-13)
Every email now has an HTML design (`src/emails/`): one layout and one template per kind (password reset, account approved/rejected, assigned, status changed, mentioned, new message, added to a project). Each has its own label, accent colour (the status colours, so a "failed" email has a red bar) and one button. Inside, it's a centred `<table>` with inline styles: Gmail and Outlook drop `<style>` blocks, flexbox, CSS variables and SVG, so the techniques the web app uses don't survive an inbox. Three rules:
- **Always send a plain-text part too** (built from the same content): some clients and filters prefer it, and it's what the dev console prints when there's no SMTP.
- **Escape everything a user typed** (names, bug titles, messages): an email must never render markup someone put in a bug title.
- **Store the rendered HTML in the outbox row**, next to the text: the worker sends exactly what was decided at the time, even if a template changes before it goes out.

`npm run email:preview` writes every template with sample data to `.email-previews/` so you can look at them in a browser without sending anything.

## Try it yourself
1. Log in as Admin in Postman, then in a terminal run `npm run realtime:listen -- <accessToken>`. Run **Auth → Register** in Postman and watch `notification:new` arrive.
2. Create a bug, then run `npm run realtime:listen -- <token> <bugKey>` and send chat messages from Postman. You'll see `message:new`, `message:updated`, `message:deleted`.
3. With `SMTP_HOST` empty, report a bug with `"sendEmail": true` and watch the API console: within ~15s the worker prints the email. Look at the `emailoutboxes` collection in Compass and follow the row from `pending` to `sent`.
4. **Exercise:** set `SMTP_HOST` to a host that doesn't exist (that alone turns sending on), then send yourself a reset link. Watch `attempts`, `nextAttemptAt` and `lastError` change, until `failed`.
5. **Exercise:** in `claimNext`, replace `findOneAndUpdate` with `findOne` followed by `updateOne`. Start two API processes against the same DB (two ports, one of them with its socket layer unused) and queue 20 emails. Count the sends. Why does the atomic version never double-send?
