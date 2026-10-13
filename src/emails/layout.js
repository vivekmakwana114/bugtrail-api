import config from '../config/config.js';

/*
 * The one HTML layout every BugTrail email uses. Email clients are not browsers: Gmail and
 * Outlook drop <style> blocks, flexbox, CSS variables and SVG, so this is a centred table with
 * inline styles only. Every email also ships a plain-text part (built from the same content) for
 * clients that show text, and for the dev console when no SMTP is configured.
 *
 * Colours are the web app's light theme (bugtrail-web src/app/globals.css), so an email looks
 * like it came from the product. Anything that came from a user (names, bug titles, messages) is
 * HTML-escaped: an email must never render markup someone typed into a bug title.
 */

const C = {
  page: '#efeeea',
  card: '#f9f9f6',
  line: '#d9d7d0',
  ink: '#1d1e1c',
  ink2: '#55564f',
  ink3: '#85857c',
  well: '#e6e5e0',
};

/** Accent per kind of email: the status colours, used for the thin bar and the label. */
const ACCENTS = {
  neutral: C.ink,
  reported: '#3a5fc4',
  ongoing: '#a86d12',
  resolved: '#19807b',
  pass: '#3a7a37',
  failed: '#bd3f27',
};

const FONT = "'Instrument Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', SFMono-Regular, Consolas, 'Liberation Mono', monospace";

/**
 * @param {string} value
 * @returns {string} safe to put in HTML text or attributes
 */
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Paragraph text: escaped, line breaks kept. */
const paragraph = (text) =>
  `<p style="margin:0 0 14px;font:400 15px/1.55 ${FONT};color:${C.ink2};">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

/**
 * @typedef {Object} EmailContent
 * @property {string} subject
 * @property {string} preheader - the grey preview line in the inbox list
 * @property {string} label - small caps line above the heading, e.g. "Assigned to you"
 * @property {keyof ACCENTS} [accent]
 * @property {string} heading
 * @property {string} [greeting] - "Hi Riya,"
 * @property {string[]} paragraphs
 * @property {{ label: string, value: string, mono?: boolean }[]} [facts] - a small key/value block
 * @property {string} [quote] - a message excerpt, shown as a quoted block
 * @property {{ label: string, url: string }} [cta] - the one button
 * @property {string} [footnote] - small print under the button
 */

/**
 * @param {EmailContent} content
 * @returns {{ subject: string, html: string, text: string }}
 */
const renderEmail = (content) => {
  const accent = ACCENTS[content.accent ?? 'neutral'];
  const logo = `${config.clientUrl}/assets/bugtrail-icon-512.png`;

  const facts = content.facts?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border:1px solid ${C.line};border-radius:6px;background:${C.page};">
        ${content.facts
          .map(
            (fact, i) => `<tr>
          <td style="padding:9px 14px;${i ? `border-top:1px solid ${C.line};` : ''}font:500 12px/1.4 ${FONT};color:${C.ink3};width:120px;vertical-align:top;">${escapeHtml(fact.label)}</td>
          <td style="padding:9px 14px;${i ? `border-top:1px solid ${C.line};` : ''}font:${fact.mono ? `500 13px/1.4 ${MONO}` : `500 14px/1.4 ${FONT}`};color:${C.ink};">${escapeHtml(fact.value)}</td>
        </tr>`,
          )
          .join('')}
      </table>`
    : '';

  const quote = content.quote
    ? `<div style="margin:4px 0 18px;padding:12px 14px;border-left:3px solid ${accent};background:${C.well};border-radius:0 6px 6px 0;font:400 14px/1.55 ${FONT};color:${C.ink};">${escapeHtml(content.quote).replace(/\n/g, '<br>')}</div>`
    : '';

  const cta = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 6px;">
        <tr><td style="border-radius:6px;background:${C.ink};">
          <a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:11px 20px;font:600 14px/1 ${FONT};color:${C.page};text-decoration:none;border-radius:6px;">${escapeHtml(content.cta.label)}</a>
        </td></tr>
      </table>
      <p style="margin:8px 0 0;font:400 12px/1.5 ${FONT};color:${C.ink3};">Or paste this link: <span style="color:${C.ink2};word-break:break-all;">${escapeHtml(content.cta.url)}</span></p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 4px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;padding-right:10px;"><img src="${logo}" width="28" height="28" alt="" style="display:block;border:0;border-radius:6px;"></td>
          <td style="vertical-align:middle;font:600 17px/1 ${FONT};color:${C.ink};letter-spacing:-0.2px;">BugTrail</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:8px;overflow:hidden;">
        <div style="height:4px;background:${accent};line-height:4px;font-size:0;">&nbsp;</div>
        <div style="padding:28px 28px 26px;">
          <p style="margin:0 0 8px;font:600 11px/1.4 ${MONO};letter-spacing:1px;text-transform:uppercase;color:${accent};">${escapeHtml(content.label)}</p>
          <h1 style="margin:0 0 18px;font:600 22px/1.3 ${FONT};color:${C.ink};letter-spacing:-0.3px;">${escapeHtml(content.heading)}</h1>
          ${content.greeting ? paragraph(content.greeting) : ''}
          ${content.paragraphs.map(paragraph).join('')}
          ${facts}${quote}${cta}
          ${content.footnote ? `<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid ${C.line};font:400 12px/1.5 ${FONT};color:${C.ink3};">${escapeHtml(content.footnote)}</p>` : ''}
        </div>
      </td></tr>
      <tr><td style="padding:16px 4px 0;font:400 12px/1.5 ${FONT};color:${C.ink3};">
        Sent by BugTrail, Invennico's bug tracker. You get emails only when someone ticks "Send email" on an action, or for your account.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    content.heading,
    '',
    ...(content.greeting ? [content.greeting, ''] : []),
    ...content.paragraphs.flatMap((p) => [p, '']),
    ...(content.facts?.length ? [...content.facts.map((f) => `${f.label}: ${f.value}`), ''] : []),
    ...(content.quote ? [`"${content.quote}"`, ''] : []),
    ...(content.cta ? [`${content.cta.label}: ${content.cta.url}`, ''] : []),
    ...(content.footnote ? [content.footnote, ''] : []),
    '-- BugTrail',
  ].join('\n');

  return { subject: content.subject, html, text };
};

export { renderEmail, escapeHtml, ACCENTS };
