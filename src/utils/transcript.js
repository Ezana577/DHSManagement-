// ─────────────────────────────────────────────────────────────
//  DHS Transcript Generator
//  Fetches all messages from a ticket channel and builds a
//  self-contained HTML file. The file is uploaded to Discord
//  as an attachment, and the resulting CDN URL is returned.
// ─────────────────────────────────────────────────────────────

import { AttachmentBuilder } from 'discord.js';

/**
 * Collect all messages from a channel (up to 10 000).
 */
async function fetchAllMessages(channel) {
    const messages = [];
    let before = undefined;

    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
        if (!batch || batch.size === 0) break;
        messages.push(...batch.values());
        before = batch.last().id;
        if (batch.size < 100) break;
    }

    return messages.reverse(); // oldest first
}

/**
 * Escape HTML special characters.
 */
function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Build the HTML transcript and upload it to a log channel.
 * Returns the CDN URL of the uploaded file, or null on failure.
 *
 * @param {TextChannel} ticketChannel  – the ticket channel being closed
 * @param {TextChannel} logChannel     – where to upload the transcript file
 * @param {string}      ticketId       – e.g. "ticket-12"
 */
export async function generateTranscript(ticketChannel, logChannel, ticketId) {
    const messages = await fetchAllMessages(ticketChannel);

    const rows = messages.map(m => {
        const time = new Date(m.createdTimestamp).toLocaleString('en-US', { timeZoneName: 'short' });
        const author = esc(m.author?.tag ?? 'Unknown');
        const avatar = m.author?.displayAvatarURL({ size: 32, extension: 'png' }) ?? '';
        const content = esc(m.content || '');

        const embeds = m.embeds.map(e => {
            const title  = e.title  ? `<div class="e-title">${esc(e.title)}</div>` : '';
            const desc   = e.description ? `<div class="e-desc">${esc(e.description)}</div>` : '';
            const fields = e.fields.map(f =>
                `<div class="e-field"><span class="e-fname">${esc(f.name)}</span><span class="e-fval">${esc(f.value)}</span></div>`
            ).join('');
            const color  = e.color ? `border-left: 4px solid #${e.color.toString(16).padStart(6,'0')};` : 'border-left: 4px solid #1d72d7;';
            return `<div class="embed" style="${color}">${title}${desc}${fields}</div>`;
        }).join('');

        const attachments = [...m.attachments.values()].map(a =>
            a.contentType?.startsWith('image/')
                ? `<img src="${a.url}" alt="attachment" class="attach-img" />`
                : `<a href="${a.url}" class="attach-link">${esc(a.name)}</a>`
        ).join('');

        return `
        <div class="msg">
            <img class="avatar" src="${avatar}" alt="" />
            <div class="msg-body">
                <span class="author">${author}</span>
                <span class="time">${time}</span>
                ${content ? `<div class="content">${content}</div>` : ''}
                ${embeds}
                ${attachments}
            </div>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Transcript — ${esc(ticketId)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1e1f22; color: #dcddde; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; line-height: 1.5; }
  header { background: #1d72d7; padding: 16px 24px; }
  header h1 { font-size: 18px; font-weight: 700; color: #fff; letter-spacing: .5px; }
  header p  { font-size: 12px; color: rgba(255,255,255,.7); margin-top: 2px; }
  .messages { padding: 16px 24px; display: flex; flex-direction: column; gap: 12px; }
  .msg { display: flex; gap: 12px; }
  .avatar { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; background: #36393f; }
  .msg-body { flex: 1; min-width: 0; }
  .author { font-weight: 600; color: #fff; margin-right: 8px; }
  .time   { font-size: 11px; color: #72767d; }
  .content { margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
  .embed  { margin-top: 6px; background: #2b2d31; border-radius: 4px; padding: 10px 12px; max-width: 520px; }
  .e-title  { font-weight: 700; color: #fff; margin-bottom: 4px; }
  .e-desc   { color: #dcddde; font-size: 13px; }
  .e-field  { display: flex; flex-direction: column; margin-top: 6px; }
  .e-fname  { font-weight: 600; font-size: 12px; color: #b9bbbe; }
  .e-fval   { font-size: 13px; }
  .attach-img  { margin-top: 6px; max-width: 300px; border-radius: 4px; display: block; }
  .attach-link { margin-top: 4px; color: #1d72d7; display: block; }
  footer { text-align: center; font-size: 11px; color: #72767d; padding: 24px; }
</style>
</head>
<body>
<header>
  <h1>Department of Homeland Security — Ticket Transcript</h1>
  <p>Ticket: ${esc(ticketId)} &nbsp;|&nbsp; Channel: #${esc(ticketChannel.name)} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-US', { timeZoneName: 'short' })}</p>
</header>
<div class="messages">${rows || '<p style="color:#72767d;padding:16px 0">No messages found.</p>'}</div>
<footer>Department of Homeland Security &mdash; Transcript System</footer>
</body>
</html>`;

    const buffer = Buffer.from(html, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `transcript-${ticketId}.html` });

    const msg = await logChannel.send({
        content: `Transcript for **${ticketId}**`,
        files: [attachment]
    }).catch(err => {
        console.error('[DHS Transcript] Failed to upload transcript:', err);
        return null;
    });

    if (!msg) return null;

    // Return the CDN URL of the first attachment
    const url = msg.attachments.first()?.url ?? null;
    return url;
}
