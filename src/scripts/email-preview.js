/* eslint-disable no-console */
/**
 * npm run email:preview: renders every BugTrail email with sample data into .email-previews/
 * (gitignored) plus an index.html linking them, so the designs can be checked in a browser
 * without sending anything. Nothing touches the database or SMTP.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { notificationTypes } from '../config/notificationTypes.js';
import config from '../config/config.js';
import { accountActiveEmail, accountRejectedEmail, notificationEmail, resetPasswordEmail } from '../emails/templates.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, '.email-previews');
const app = (p) => `${config.clientUrl}${p}`;

const samples = {
  'reset-password': resetPasswordEmail({ url: app('/reset-password?token=sample-token') }),
  'account-active': accountActiveEmail({ name: 'Riya Shah', url: app('/login'), role: 'Developer' }),
  'account-rejected': accountRejectedEmail({ name: 'Sam Visitor' }),
  'bug-assigned': notificationEmail({
    type: notificationTypes.BUG_ASSIGNED,
    title: 'CHK-42 was assigned to you',
    message: 'Meera QA assigned you "Coupon field loses focus on every keystroke" in Checkout revamp.',
    url: app('/projects/CHK/bugs/CHK-42'),
    recipientName: 'Riya Shah',
    actorName: 'Meera QA',
  }),
  'status-failed': notificationEmail({
    type: notificationTypes.BUG_STATUS_CHANGED,
    title: 'CHK-42 is now failed',
    message: 'Meera QA moved "Coupon field loses focus on every keystroke" from resolved to failed.',
    url: app('/projects/CHK/bugs/CHK-42'),
    recipientName: 'Riya Shah',
    actorName: 'Meera QA',
  }),
  'status-pass': notificationEmail({
    type: notificationTypes.BUG_STATUS_CHANGED,
    title: 'CHK-42 is now pass',
    message: 'Meera QA moved "Coupon field loses focus on every keystroke" from resolved to pass.',
    url: app('/projects/CHK/bugs/CHK-42'),
    recipientName: 'Riya Shah',
    actorName: 'Meera QA',
  }),
  mentioned: notificationEmail({
    type: notificationTypes.BUG_MENTIONED,
    title: 'Meera QA mentioned you on CHK-42',
    message: '@Riya Shah can you check this on a Pixel 7? It only happens after the second coupon.',
    url: app('/projects/CHK/bugs/CHK-42'),
    recipientName: 'Riya Shah',
    actorName: 'Meera QA',
  }),
  'added-to-project': notificationEmail({
    type: notificationTypes.PROJECT_MEMBER_ADDED,
    title: 'You were added to Checkout revamp',
    message: 'Arjun Manager added you to Checkout revamp (CHK).',
    url: app('/projects/CHK'),
    recipientName: 'Riya Shah',
    actorName: 'Arjun Manager',
  }),
};

await mkdir(outDir, { recursive: true });
await Promise.all(
  // Paths are this script's own fixed sample names under .email-previews/, never user input.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  Object.entries(samples).map(([name, email]) => writeFile(path.join(outDir, `${name}.html`), email.html)),
);
const index = `<!doctype html><meta charset="utf-8"><title>BugTrail email previews</title>
<body style="font:15px/1.6 system-ui;margin:32px;background:#efeeea;color:#1d1e1c">
<h1 style="font-size:20px">BugTrail email previews</h1><ul>
${Object.entries(samples)
  .map(([name, email]) => `<li><a href="${name}.html">${name}</a>: ${email.subject.replace(/</g, '&lt;')}</li>`)
  .join('\n')}
</ul></body>`;
// eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed path under .email-previews/
await writeFile(path.join(outDir, 'index.html'), index);
console.log(`Wrote ${Object.keys(samples).length} previews to ${outDir}${path.sep}index.html`);
