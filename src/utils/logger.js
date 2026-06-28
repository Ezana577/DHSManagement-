// ─────────────────────────────────────────────────────────────
//  DHS Logger Utility
//  ALL logs go to Discord channels. Nothing is stored in Supabase.
//
//  LOG_CHANNEL_ID  → action logs  (1400610140406808768)
//  CLOSE_CHANNEL_ID → ticket closure logs (1400610094412070934)
// ─────────────────────────────────────────────────────────────

import { EmbedBuilder } from 'discord.js';

const EMBED_COLOR = 0x1d72d7;

/**
 * Send an action log embed to the action log channel.
 *
 * @param {Client}  client
 * @param {Object}  opts
 * @param {string}  opts.action       – e.g. "Claim", "Add User"
 * @param {User}    opts.executor     – who performed the action
 * @param {User}    [opts.target]     – target user if applicable
 * @param {string}  [opts.ticketId]   – e.g. "ticket-12"
 * @param {string}  [opts.reason]     – optional reason
 * @param {Object}  [opts.extra]      – additional { name, value } fields
 */
export async function logAction(client, opts = {}) {
    const channelId = process.env.LOG_CHANNEL_ID || '1400610140406808768';
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        console.error(`[DHS Logger] Action log channel not found: ${channelId}`);
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`${opts.action}`)
        .setTimestamp();

    if (opts.executor) {
        embed.addFields({ name: 'Executor', value: `<@${opts.executor.id}> (${opts.executor.tag})`, inline: true });
    }
    if (opts.target) {
        embed.addFields({ name: 'Target', value: `<@${opts.target.id}> (${opts.target.tag})`, inline: true });
    }
    if (opts.ticketId) {
        embed.addFields({ name: 'Ticket', value: opts.ticketId, inline: true });
    }
    if (opts.reason) {
        embed.addFields({ name: 'Reason', value: opts.reason });
    }
    if (opts.extra) {
        for (const field of (Array.isArray(opts.extra) ? opts.extra : [opts.extra])) {
            embed.addFields(field);
        }
    }

    await channel.send({ embeds: [embed] }).catch(err =>
        console.error('[DHS Logger] Failed to send action log:', err)
    );
}

/**
 * Send a closure log embed to the closure log channel.
 */
export async function logClosure(client, opts = {}) {
    const channelId = process.env.CLOSE_LOG_CHANNEL_ID || '1400610094412070934';
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        console.error(`[DHS Logger] Closure log channel not found: ${channelId}`);
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('Ticket Closed')
        .addFields(
            { name: 'Ticket ID',   value: opts.ticketId  || 'Unknown',                          inline: true },
            { name: 'Opened By',   value: opts.openedBy  ? `<@${opts.openedBy}>`  : 'Unknown',  inline: true },
            { name: 'Closed By',   value: opts.closedBy  ? `<@${opts.closedBy}>`  : 'Unknown',  inline: true },
            { name: 'Open Time',   value: opts.openTime  || 'Unknown',                          inline: true },
            { name: 'Reason',      value: opts.reason    || 'No reason provided'                            }
        )
        .setTimestamp();

    const components = [];

    // Build action row with optional buttons
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const row = new ActionRowBuilder();

    // "View Transcript" button — always present if link exists
    if (opts.transcriptUrl) {
        row.addComponents(
            new ButtonBuilder()
                .setLabel('View Transcript')
                .setStyle(ButtonStyle.Link)
                .setURL(opts.transcriptUrl)
        );
    }

    // "Edit Reason" button — only if user still has access
    if (opts.canEditReason) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket:editreason:${opts.ticketDbId}`)
                .setLabel('Edit Reason')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    if (row.components.length > 0) {
        components.push(row);
    }

    await channel.send({ embeds: [embed], components }).catch(err =>
        console.error('[DHS Logger] Failed to send closure log:', err)
    );
}
