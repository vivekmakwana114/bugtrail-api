# BugTrail APIs: Postman collection

`BugTrail.postman_collection.json` holds every endpoint, one folder per module: **Health, Auth, Roles, Users, Projects, Bugs, Chat, Notifications, Dashboard**.

## Use it
1. Start the API (`npm run dev`) and create the Admin (`npm run seed`).
2. Postman → **Import** → pick `BugTrail.postman_collection.json`.
3. Open the collection → **Variables** and set `adminEmail` / `adminPassword` to the Admin you created. Change `baseUrl` if the API isn't on `http://localhost:5000/v1`.
4. Run **Auth → Login**. It stores `accessToken`, and every other request uses it automatically.
5. Or click **Run collection**: the folders are ordered so a full run passes against a freshly seeded API, and it can be re-run.

Ids are captured for you by the test scripts: **Register** saves `pendingUserId`, **Create user** saves `userId`, **Create project** saves `projectId` (with a fresh random key each run, because keys are unique forever). **Add members** adds the user approved in the Users folder. The **Bugs** folder is self-contained: it creates its own project, walks one bug through the whole lifecycle (including a QA fail) and cleans up. **Chat** works the same way. **Notifications** shows the Admin's bell (Register creates a "waiting for approval" notification).

Postman can't save Socket.IO requests in a collection. To see the live side, run `npm run realtime:listen -- {{accessToken}} <bugId>` in a terminal while you send Chat requests. The refresh token is an httpOnly cookie that Postman keeps in its cookie jar, so **Refresh tokens** works like a browser. The Postman desktop app is needed for cookies on `localhost`.

**Reset password** skips itself until you paste a token into `resetToken`. With `EMAIL_ENABLED=false`, the reset link is printed in the API console after **Forgot password**.

## Change it
Don't edit the JSON by hand. The requests are defined in `build-collection.js`; edit that, then run:

```bash
npm run postman
```

Any phase that adds or changes an endpoint updates `build-collection.js` and the generated JSON in the same commit.

From the command line (CI or a quick check):
```bash
npx newman run docs/postman/BugTrail.postman_collection.json --env-var baseUrl=http://localhost:5000/v1
```
