// ─────────────────────────────────────────────────────────────
//  DHS Ticket Helpers
//  Shared functions used across ticket commands.
// ─────────────────────────────────────────────────────────────

import {
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import supabase from './supabase.js';

export const EMBED_COLOR = 0x1d72d7;

// One Discord category folder per ticket type
export const CATEGORY_IDS = {
    general: process.env.TICKET_CATEGORY_GENERAL,
    appeal:  process.env.TICKET_CATEGORY_APPEAL,
    report:  process.env.TICKET_CATEGORY_REPORT,
};

/**
 * Get the next ticket number for a guild (persistent, never resets).
 */
export async function getNextTicketNumber(guildId) {
    // Upsert: increment counter or create at 1
    const { data, error } = await supabase
        .from('ticket_counters')
        .upsert({ guild_id: guildId, counter: 1 }, { onConflict: 'guild_id', ignoreDuplicates: false })
        .select('counter')
        .single();

    if (error && error.code !== '23505') {
        // If upsert returned nothing, do a raw increment
    }

    // Use RPC for atomic increment
    const { data: rpc, error: rpcErr } = await supabase.rpc('increment_ticket_counter', { p_guild_id: guildId });
    if (rpcErr) {
        console.error('[DHS Tickets] Counter RPC error:', rpcErr);
        // Fallback: read current + 1
        const { data: cur } = await supabase
            .from('ticket_counters')
            .select('counter')
            .eq('guild_id', guildId)
            .single();
        return (cur?.counter ?? 0) + 1;
    }
    return rpc;
}

/**
 * Build permission overwrites for a new ticket channel.
 * HR+ can see/write; the ticket opener can see/write; everyone else is denied.
 */
export function buildTicketOverwrites(guild, openerId) {
    const ROLE_HR  = process.env.ROLE_HR;
    const ROLE_SHR = process.env.ROLE_SHR;
    const ROLE_LS  = process.env.ROLE_LS;

    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: openerId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }
    ];

    for (const roleId of [ROLE_HR, ROLE_SHR, ROLE_LS]) {
        if (roleId) {
            overwrites.push({
                id: roleId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
            });
        }
    }

    return overwrites;
}

/**
 * Fetch a ticket record from Supabase by channel ID.
 */
export async function getTicketByChannel(channelId) {
    const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('channel_id', channelId)
        .single();
    if (error) return null;
    return data;
}

/**
 * Check whether a channel is an active ticket channel.
 */
export async function isTicketChannel(channelId) {
    const ticket = await getTicketByChannel(channelId);
    return !!ticket && ticket.status === 'open';
}

/**
 * Build the ticket opener embed for a General ticket.
 */
export function buildGeneralEmbed() {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('General Inquiry')
        .setDescription(
            'Please state your inquiry and be patient while our support team assists you.\n\n' +
            'Do not ping staff unless 24 hours have passed.\n' +
            'Failure to comply will result in a Warning, Mute, or Ticket closure.'
        );
}

/**
 * Build the ticket opener embed for a Report ticket.
 */
export function buildReportEmbed() {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('Report Ticket')
        .setDescription('Please fill out the fields below.')
        .addFields(
            { name: 'User Reporting',     value: 'Tag the user submitting this report.',    inline: false },
            { name: 'Reported User',      value: 'Tag the user being reported.',             inline: false },
            { name: 'Type of Violation',  value: 'Describe the type of violation.',          inline: false },
            { name: 'Date',               value: 'Provide the date of the incident.',        inline: false },
            { name: 'Description',        value: 'Provide a full description.',              inline: false },
            { name: 'Evidence',           value: 'Provide image or video links.',            inline: false }
        )
        .setFooter({ text: 'Do not ping staff unless 24 hours have passed. False reports may result in disciplinary action.' });
}

/**
 * Build the ticket opener embed for an Appeal ticket.
 */
export function buildAppealEmbed() {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('Appeal Format')
        .setDescription('Please fill out the fields below.')
        .addFields(
            { name: 'User',                     value: 'Tag yourself.',                                      inline: false },
            { name: 'Punished By',              value: 'Tag the staff member who issued the punishment.',    inline: false },
            { name: 'Punishment',               value: 'State the punishment applied.',                      inline: false },
            { name: 'Reason Given',             value: 'State the reason provided for the punishment.',      inline: false },
            { name: 'Why should this be removed', value: 'Explain why this punishment should be removed.',   inline: false },
            { name: 'Evidence',                 value: 'Provide any supporting evidence.',                   inline: false }
        )
        .setFooter({ text: 'Do not ping staff unless 24 hours have passed. False appeals may result in disciplinary action.' });
}

/**
 * Build the close request embed.
 */
export function buildCloseRequestEmbed(requesterId, reason) {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('Close Request')
        .setDescription(`<@${requesterId}> has requested to close this ticket.`)
        .addFields({ name: 'Reason', value: reason || 'No reason provided.' });
}

/**
 * Build close-request buttons.
 */
export function buildCloseRequestRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket:closerequest:accept')
            .setLabel('Accept & Close')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('ticket:closerequest:deny')
            .setLabel('Deny & Keep Open')
            .setStyle(ButtonStyle.Secondary)
    );
}
