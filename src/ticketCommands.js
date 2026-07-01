// ═══════════════════════════════════════════════════════════════════════════════
//  DHS TICKET SYSTEM — ALL COMMANDS IN ONE FILE
//  Commands: /add /blacklist /claim /unclaim /close /closerequest
//            /panel /remove /rename /transfer /jump /config
//
//  Usage in index.js — instead of loading a folder, import this file:
//
//    import * as allCommands from './commands.js';
//    for (const cmd of allCommands.commands) {
//        client.commands.set(cmd.data.name, cmd);
//        commandPayloads.push(cmd.data.toJSON());
//        if (cmd.buttons)  for (const [id, h] of Object.entries(cmd.buttons))  client.buttons.set(id, h);
//        if (cmd.modals)   for (const [id, h] of Object.entries(cmd.modals))   client.modals.set(id, h);
//        if (cmd.selectMenus) for (const [id, h] of Object.entries(cmd.selectMenus)) client.selectMenus.set(id, h);
//    }
//
//  ENV VARS expected:
//    ROLE_HR, ROLE_SHR, ROLE_LS, ROLE_EXEC
//    TICKET_CATEGORY_GENERAL, TICKET_CATEGORY_APPEAL, TICKET_CATEGORY_REPORT
//    LOG_CHANNEL_ID, CLOSE_LOG_CHANNEL_ID
//    SUPABASE_URL, SUPABASE_SERVICE_KEY
//
//  SUPABASE — new table required for /config:
//    create table command_permissions (
//      guild_id      text not null,
//      command_name  text not null,
//      role_id       text not null,
//      added_by      text,
//      added_at      timestamptz default now(),
//      primary key (guild_id, command_name, role_id)
//    );
// ═══════════════════════════════════════════════════════════════════════════════

import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    RoleSelectMenuBuilder,
    PermissionFlagsBits,
    ChannelType,
    AttachmentBuilder,
} from 'discord.js';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ─── Constants ────────────────────────────────────────────────────────────────
const EMBED_COLOR         = 0x1d72d7;
const PANEL_BANNER        = 'https://cdn.discordapp.com/attachments/1400947813365584025/1520632307864698990/9C652B65-D0C3-4EDE-BD57-3EBAF88A1D91.png?ex=6a41e6b2&is=6a409532&hm=ea2c38fd45634bd4ee9a8335f3a7c84c5eb0976bb5ef9c98a9ead0483c6784b9&';
const LOG_CHANNEL_ID      = process.env.LOG_CHANNEL_ID       || '1400610140406808768';
const CLOSE_LOG_CHANNEL   = process.env.CLOSE_LOG_CHANNEL_ID || '1400610094412070934';

// ─── Category metadata (shared by panel send + panel switch) ──────────────────
const CATEGORY_TITLES = {
    general: "❓ General Inquiry's",
    appeal:  "📄 Appeal Inquiry's",
    report:  "🚨 Report Inquiry's",
};
const CATEGORY_LABELS = {
    general: "❓ General Inquiry's",
    appeal:  "📄 Appeal Inquiry's",
    report:  "🚨 Report Inquiry's",
};

// ─── Permissions (chain of command: Executive > LS > SHR > HR) ────────────────
function hasRole(member, ...ids) { return ids.some(id => id && member.roles.cache.has(id)); }
function isExec(member) { return hasRole(member, process.env.ROLE_EXEC); }
function isLS(member)   { return hasRole(member, process.env.ROLE_EXEC, process.env.ROLE_LS); }
function isSHR(member)  { return hasRole(member, process.env.ROLE_EXEC, process.env.ROLE_LS, process.env.ROLE_SHR); }
function isHR(member)   { return hasRole(member, process.env.ROLE_EXEC, process.env.ROLE_LS, process.env.ROLE_SHR, process.env.ROLE_HR); }

// ═══════════════════════════════════════════════════════════════════════════════
//  DYNAMIC PER-COMMAND PERMISSIONS  (powers /config)
//
//  Every gated command/button checks `canUseCommand(guildId, commandName, member)`
//  instead of a hardcoded isHR/isSHR call. If no custom roles have been
//  configured for a command (table empty for that guild+command), it falls
//  back to a sensible default tier.
// ═══════════════════════════════════════════════════════════════════════════════
// Note: /panel is split into three separate config keys (panel_send, panel_edit,
// panel_switch) rather than one lumped "panel" entry, because the edit-lock
// below applies ONLY to panel_send and panel_edit — panel_switch is editable
// by SHR+ like every other command.
const COMMAND_LIST = ['add', 'blacklist', 'claim', 'unclaim', 'close', 'closerequest', 'panel_send', 'panel_edit', 'panel_switch', 'remove', 'rename', 'transfer'];
const COMMAND_DISPLAY_NAMES = {
    panel_send: 'panel send', panel_edit: 'panel edit', panel_switch: 'panel switch',
};

// Commands whose permission list can ONLY be edited by LS+ (Executives included,
// since Executive sits above LS in the chain). SHR can VIEW but not edit these
// via /config — per request, this applies only to panel send and panel edit.
const LS_ONLY_EDIT_COMMANDS = new Set(['panel_send', 'panel_edit']);

const DEFAULT_COMMAND_TIER = {
    add: 'hr', remove: 'hr', rename: 'hr', claim: 'hr', unclaim: 'hr',
    close: 'hr', closerequest: 'hr', panel_send: 'ls', panel_edit: 'ls', panel_switch: 'hr',
    blacklist: 'shr', transfer: 'shr',
};

function defaultRoleIdsForTier(tier) {
    if (tier === 'ls')  return [process.env.ROLE_LS, process.env.ROLE_EXEC].filter(Boolean);
    if (tier === 'shr') return [process.env.ROLE_SHR, process.env.ROLE_LS, process.env.ROLE_EXEC].filter(Boolean);
    return [process.env.ROLE_HR, process.env.ROLE_SHR, process.env.ROLE_LS, process.env.ROLE_EXEC].filter(Boolean); // 'hr' tier
}

// Sentinel row stored alongside real role rows in `command_permissions` to mark
// "this guild has explicitly customized this command's role list" — even after
// every real role has been removed. Without this, removing the LAST configured
// role made the table go empty, which fell back to the DEFAULT tier again,
// silently un-removing whatever role you just removed (e.g. SHR kept being
// able to use /blacklist no matter what you did in /config).
const CONFIG_META_ROLE_ID = '__configured__';

async function getCustomCommandRoles(guildId, commandName) {
    const { data, error } = await supabase
        .from('command_permissions')
        .select('role_id')
        .eq('guild_id', guildId)
        .eq('command_name', commandName);

    if (error) {
        console.error('[DHS Tickets] command_permissions read error:', error);
        return null;
    }
    if (!data || data.length === 0) return null; // never configured for this command — use default tier
    const hasMeta = data.some(r => r.role_id === CONFIG_META_ROLE_ID);
    if (!hasMeta) return null; // safety guard, shouldn't normally happen
    return data.map(r => r.role_id).filter(id => id !== CONFIG_META_ROLE_ID);
}

// Returns { roleIds, isCustom } — the roles currently allowed to use a command,
// and whether that list came from /config (custom) or the built-in default tier.
async function getEffectiveCommandRoles(guildId, commandName) {
    const custom = await getCustomCommandRoles(guildId, commandName);
    if (custom !== null) return { roleIds: custom, isCustom: true };
    const tier = DEFAULT_COMMAND_TIER[commandName] || 'hr';
    return { roleIds: defaultRoleIdsForTier(tier), isCustom: false };
}

// FIX: Executives no longer get an unconditional bypass here. Previously
// `if (isExec(member)) return true;` meant removing Executive's role from a
// command's custom config did nothing — Executive could still use (and
// manage) that command regardless. Now Executive only has access through the
// same role list everyone else uses, which by default already includes
// ROLE_EXEC for every tier — so nothing changes for un-customized commands,
// but a guild can now deliberately lock Executive out of a specific command
// via /config if they choose to.
async function canUseCommand(guildId, commandName, member) {
    const { roleIds } = await getEffectiveCommandRoles(guildId, commandName);
    return roleIds.some(id => member.roles.cache.has(id));
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function getTicketByChannel(channelId) {
    const { data } = await supabase.from('tickets').select('*').eq('channel_id', channelId).single();
    return data ?? null;
}

// ─── Permission overwrites for new ticket channels ────────────────────────────
function buildTicketOverwrites(guild, openerId) {
    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: openerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ];
    for (const roleId of [process.env.ROLE_HR, process.env.ROLE_SHR, process.env.ROLE_LS, process.env.ROLE_EXEC]) {
        if (roleId) overwrites.push({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
        });
    }
    return overwrites;
}

// ─── Category embeds ──────────────────────────────────────────────────────────
function buildGeneralEmbed() {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(CATEGORY_TITLES.general)
        .setDescription(
            `Please state your inquiry and wait patiently as our support team reviews the ticket. ` +
            `Failure to state your inquiry after **10** minutes will result in a closure of your ticket.\n\n` +
            `> Failure to fill out the format above will result in a closure of this ticket. Additionally, do not ping any staff to respond to the ticket unless it has been past **3 hours**. ` +
            `Failure to follow this rule will result in the following: **Warning → Mute → Ticket closed.**`
        )
        .setFooter({ text: 'DHS | Support System' });
}

function buildAppealEmbed() {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(CATEGORY_TITLES.appeal)
        .setDescription(
            `Please make sure to fill out the fields below!\n\n` +
            `> \`User:\`\n` +
            `> \`Punished By:\`\n` +
            `> \`Punishment:\`\n` +
            `> \`Reason Given:\`\n` +
            `> \`Why Should This Be Removed:\`\n` +
            `> \`Any Supporting Evidence:\`\n\n` +
            `> Failure to fill out the format above will result in a closure of this ticket. Additionally, do not ping any staff to respond to the ticket unless it has been past **3 hours**. ` +
            `Failure to follow this rule will result in the following: **Warning → Mute → Ticket closed.**`
        )
        .setFooter({ text: 'DHS | Support System' });
}

function buildReportEmbed() {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(CATEGORY_TITLES.report)
        .setDescription(
            `Please make sure to fill out the fields below!\n\n` +
            `> \`User/Agent:\`\n` +
            `> \`Date of Incident:\`\n` +
            `> \`Explanation:\`\n` +
            `> \`Evidence:\`\n\n` +
            `> Failure to fill out the format above will result in a closure of this ticket. Additionally, do not ping any staff to respond to the ticket unless it has been past **3 hours**. ` +
            `Failure to follow this rule will result in the following: **Warning → Mute → Ticket closed.**`
        )
        .setFooter({ text: 'DHS | Support System' });
}

function buildCategoryEmbed(category) {
    if (category === 'general') return buildGeneralEmbed();
    if (category === 'appeal')  return buildAppealEmbed();
    return buildReportEmbed();
}

// ─── Ticket action buttons (sent inside every ticket on open) ─────────────────
function buildTicketActionRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket:closewithreason').setLabel('Close with Reason').setStyle(ButtonStyle.Secondary),
    );
}

// ─── Panel embed ──────────────────────────────────────────────────────────────
function buildPanelEmbed() {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setDescription(
            `# DHS Support Center\n\n` +
            `Welcome to the Department of Homeland Security Support Center. ` +
            `Please select the category below that best matches your request.`
        )
        .addFields(
            { name: '❓ General Inquiries',  value: '> • Questions or concerns\n> • Redeem a prize\n> • General assistance',                          inline: false },
            { name: '📄 Appeals',            value: '> • Appeal a punishment\n> • Appeal a Agent Infraction\n> • Request a case review',              inline: false },
            { name: '🚨 Reports',            value: '> • Report an agent\n> • Report misconduct\n> • Submit supporting evidence',                     inline: false },
            { name: 'Warning',            value: '-# Please do not submit false, duplicate, or troll tickets. Abuse may result in a Ticket Blacklist or disciplinary action.', inline: false }
        )
        .setImage(PANEL_BANNER)
        .setFooter({ text: 'DHS | Support System' });
}

function buildPanelDropdown() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticket:panel:select')
            .setPlaceholder('Select a category to open a ticket.')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel("General Inquiry's").setValue('general').setDescription('Questions, prizes, and general assistance.'),
                new StringSelectMenuOptionBuilder().setLabel("Appeal Inquiry's").setValue('appeal').setDescription('Appeal punishments, blacklists, or request case reviews.'),
                new StringSelectMenuOptionBuilder().setLabel("Report Inquiry's").setValue('report').setDescription('Report an agent, misconduct, or submit evidence.')
            )
    );
}

// ─── Logger helpers ───────────────────────────────────────────────────────────
async function logAction(client, opts = {}) {
    const channel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (!channel) return;
    const embed = new EmbedBuilder().setColor(EMBED_COLOR).setTitle(opts.action).setTimestamp();
    if (opts.executor) embed.addFields({ name: 'Executor', value: `<@${opts.executor.id}> (${opts.executor.tag ?? opts.executor.username})`, inline: true });
    if (opts.target)   embed.addFields({ name: 'Target',   value: `<@${opts.target.id}>`,   inline: true });
    if (opts.ticketId) embed.addFields({ name: 'Ticket',   value: opts.ticketId,             inline: true });
    if (opts.reason)   embed.addFields({ name: 'Reason',   value: opts.reason });
    if (opts.extra)    for (const f of (Array.isArray(opts.extra) ? opts.extra : [opts.extra])) embed.addFields(f);
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);
}

// ─── Blacklist check helper (used by the panel dropdown) ──────────────────────
async function isBlacklisted(guildId, member) {
    const roleIds = [...member.roles.cache.keys()];
    const ids = [member.id, ...roleIds];
    const orConditions = ids.map(id => `target_id.eq.${id}`).join(',');

    const { data, error } = await supabase
        .from('blacklists')
        .select('id')
        .eq('guild_id', guildId)
        .eq('active', true)
        .or(orConditions)
        .limit(1);

    if (error) {
        console.error('[DHS Tickets] Blacklist check error:', error);
        return false;
    }
    return Array.isArray(data) && data.length > 0;
}

// ─── Transcript generator (returns an attachment, does NOT send anything) ─────
async function buildTranscriptAttachment(ticketChannel, ticketId) {
    const messages = [];
    let before;
    while (true) {
        const batch = await ticketChannel.messages.fetch({ limit: 100, before }).catch(() => null);
        if (!batch || batch.size === 0) break;
        messages.push(...batch.values());
        before = batch.last().id;
        if (batch.size < 100) break;
    }
    messages.reverse();

    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    const rows = messages.map(m => {
        const time    = new Date(m.createdTimestamp).toLocaleString('en-US', { timeZoneName: 'short' });
        const author  = esc(m.author?.tag ?? m.author?.username ?? 'Unknown');
        const avatar  = m.author?.displayAvatarURL({ size: 32, extension: 'png' }) ?? '';
        const content = esc(m.content || '');
        const embeds  = m.embeds.map(e => {
            const color  = e.color ? `border-left:4px solid #${e.color.toString(16).padStart(6,'0')}` : 'border-left:4px solid #1d72d7';
            const title  = e.title       ? `<div class="et">${esc(e.title)}</div>`       : '';
            const desc   = e.description ? `<div class="ed">${esc(e.description)}</div>` : '';
            const fields = e.fields.map(f => `<div class="ef"><b>${esc(f.name)}</b><span>${esc(f.value)}</span></div>`).join('');
            return `<div class="embed" style="${color}">${title}${desc}${fields}</div>`;
        }).join('');
        const attachments = [...m.attachments.values()].map(a =>
            a.contentType?.startsWith('image/')
                ? `<img src="${a.url}" class="ai"/>`
                : `<a href="${a.url}" class="al">${esc(a.name)}</a>`
        ).join('');
        return `<div class="msg"><img class="av" src="${avatar}"/><div class="mb"><span class="au">${author}</span><span class="ts">${time}</span>${content ? `<div class="ct">${content}</div>` : ''}${embeds}${attachments}</div></div>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Transcript — ${esc(ticketId)}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{background:#1e1f22;color:#dcddde;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px}
header{background:#1d72d7;padding:16px 24px}header h1{font-size:18px;font-weight:700;color:#fff}header p{font-size:12px;color:rgba(255,255,255,.7);margin-top:2px}
.msgs{padding:16px 24px;display:flex;flex-direction:column;gap:12px}.msg{display:flex;gap:12px}.av{width:32px;height:32px;border-radius:50%;flex-shrink:0;background:#36393f}
.mb{flex:1;min-width:0}.au{font-weight:600;color:#fff;margin-right:8px}.ts{font-size:11px;color:#72767d}.ct{margin-top:4px;white-space:pre-wrap;word-break:break-word}
.embed{margin-top:6px;background:#2b2d31;border-radius:4px;padding:10px 12px;max-width:520px}.et{font-weight:700;color:#fff;margin-bottom:4px}.ed{font-size:13px}
.ef{display:flex;flex-direction:column;margin-top:6px}.ef b{font-size:12px;color:#b9bbbe}.ef span{font-size:13px}.ai{margin-top:6px;max-width:300px;border-radius:4px;display:block}
.al{margin-top:4px;color:#1d72d7;display:block}footer{text-align:center;font-size:11px;color:#72767d;padding:24px}</style></head>
<body><header><h1>Department of Homeland Security — Ticket Transcript</h1>
<p>Ticket: ${esc(ticketId)} &nbsp;|&nbsp; Channel: #${esc(ticketChannel.name)} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-US', { timeZoneName: 'short' })}</p></header>
<div class="msgs">${rows || '<p style="color:#72767d;padding:16px 0">No messages.</p>'}</div>
<footer>Department of Homeland Security — Transcript System</footer></body></html>`;

    return new AttachmentBuilder(Buffer.from(html, 'utf-8'), { name: `transcript-${ticketId}.html` });
}

// ─── Core close logic (shared by /close, button close, closerequest accept) ───
async function executeClose(interaction, ticket, reason) {
    const channel    = interaction.channel;
    const guild      = interaction.guild;
    const logChannel = guild.channels.cache.get(CLOSE_LOG_CHANNEL);

    let transcriptAttachment = null;
    if (logChannel) {
        transcriptAttachment = await buildTranscriptAttachment(channel, ticket.ticket_id);
    }

    const now        = new Date();
    const openedUnix = Math.floor(new Date(ticket.opened_at).getTime() / 1000);
    const closedUnix = Math.floor(now.getTime() / 1000);
    const claimedBy  = ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Unclaimed';

    await logAction(interaction.client, { action: 'Ticket Closed', executor: interaction.user, ticketId: ticket.ticket_id, reason });

    const logEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('Ticket Closed')
        .addFields(
            { name: 'Ticket ID',   value: ticket.ticket_id,              inline: false },
            { name: 'Opened By',   value: `<@${ticket.owner_id}>`,       inline: false },
            { name: 'Closed By',   value: `<@${interaction.user.id}>`,   inline: false },
            { name: 'Open Time',   value: `<t:${openedUnix}:F>`,         inline: false },
            { name: 'Close Time',  value: `<t:${closedUnix}:F>`,         inline: false },
            { name: 'Claimed By',  value: claimedBy,                     inline: false },
            { name: 'Reason',      value: `\`${reason}\``,               inline: false },
        )
        .setFooter({ text: 'DHS | Support System' });

    let transcriptUrl = null;
    if (logChannel && transcriptAttachment) {
        const fileMsg = await logChannel.send({ files: [transcriptAttachment] }).catch(() => null);
        transcriptUrl = fileMsg?.attachments?.first()?.url ?? null;
        if (fileMsg) await fileMsg.delete().catch(() => null);
    }

    if (logChannel) {
        const row = [
            new ButtonBuilder().setCustomId(`ticket:editreason:${ticket.id}`).setLabel('Edit Reason').setStyle(ButtonStyle.Secondary),
        ];
        if (transcriptUrl) {
            row.push(new ButtonBuilder().setLabel('View Transcript').setStyle(ButtonStyle.Link).setURL(transcriptUrl));
        }

        await logChannel.send({
            embeds: [logEmbed],
            components: [new ActionRowBuilder().addComponents(...row)],
            allowedMentions: { parse: [] },
        }).catch(() => null);
    }

    await supabase.from('tickets').update({
        status: 'closed', closed_by: interaction.user.id,
        closed_at: now.toISOString(), close_reason: reason, transcript_url: transcriptUrl
    }).eq('id', ticket.id);

    const opener = await guild.members.fetch(ticket.owner_id).catch(() => null);
    if (opener) {
        const dmEmbed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle('Your Ticket Has Been Closed')
            .addFields(
                { name: 'Ticket ID',   value: ticket.ticket_id,            inline: false },
                { name: 'Opened By',   value: `<@${ticket.owner_id}>`,     inline: false },
                { name: 'Closed By',   value: `<@${interaction.user.id}>`, inline: false },
                { name: 'Open Time',   value: `<t:${openedUnix}:F>`,       inline: false },
                { name: 'Close Time',  value: `<t:${closedUnix}:F>`,       inline: false },
                { name: 'Claimed By',  value: claimedBy,                   inline: false },
                { name: 'Reason',      value: `\`${reason}\``,             inline: false },
            )
            .setFooter({ text: 'DHS | Support System' });

        const dmComponents = [];
        if (transcriptUrl) {
            dmComponents.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('View Transcript').setStyle(ButtonStyle.Link).setURL(transcriptUrl)
            ));
        }
        await opener.send({ embeds: [dmEmbed], components: dmComponents, allowedMentions: { parse: [] } }).catch(() => null);
    }

    setTimeout(() => channel.delete(`Ticket closed by ${interaction.user.tag ?? interaction.user.username}`).catch(() => null), 4000);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  /add
// ═══════════════════════════════════════════════════════════════════════════════
const add = {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('Add a user to this ticket.')
        .addUserOption(o => o.setName('user').setDescription('User to add.').setRequired(true)),

    async execute(interaction) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        if (!(await canUseCommand(interaction.guildId, 'add', interaction.member))) return interaction.reply({ content: 'You do not have permission to add users to tickets.', ephemeral: true });

        const target = interaction.options.getMember('user');
        if (!target) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });

        const existing = interaction.channel.permissionsFor(target);
        if (existing?.has(PermissionFlagsBits.ViewChannel)) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(`<@${target.id}> already has access to this ticket.`).setFooter({ text: 'DHS | Support System' })], ephemeral: true });
        }

        await interaction.channel.permissionOverwrites.create(target, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        await logAction(interaction.client, { action: 'User Added to Ticket', executor: interaction.user, target: target.user, ticketId: ticket.ticket_id });

        return interaction.reply({
            embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`<@${target.id}> has been added to this ticket.`).setFooter({ text: 'DHS | Support System' })],
            allowedMentions: { parse: [] }
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /blacklist
// ═══════════════════════════════════════════════════════════════════════════════
const blacklist = {
    data: new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('Manage the ticket blacklist.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(sub => sub.setName('add').setDescription('Blacklist a user or role from opening tickets.')
            .addUserOption(o => o.setName('user').setDescription('User to blacklist.').setRequired(false))
            .addRoleOption(o => o.setName('role').setDescription('Role to blacklist.').setRequired(false))
            .addStringOption(o => o.setName('reason').setDescription('Reason.').setRequired(false))
        )
        .addSubcommand(sub => sub.setName('remove').setDescription('Remove a user or role from the blacklist.')
            .addUserOption(o => o.setName('user').setDescription('User to unblacklist.').setRequired(false))
            .addRoleOption(o => o.setName('role').setDescription('Role to unblacklist.').setRequired(false))
        ),

    async execute(interaction) {
        if (!(await canUseCommand(interaction.guildId, 'blacklist', interaction.member))) return interaction.reply({ content: 'You do not have permission to manage the blacklist.', ephemeral: true });

        const sub        = interaction.options.getSubcommand();
        const user        = interaction.options.getUser('user');
        const role        = interaction.options.getRole('role');
        const reason       = interaction.options.getString('reason') ?? 'No reason provided.';
        const targetId     = user?.id ?? role?.id;
        const targetType   = user ? 'user' : role ? 'role' : null;
        const targetName   = user?.tag ?? user?.username ?? role?.name;

        if (!targetId) return interaction.reply({ content: 'Provide a user or role.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        if (sub === 'add') {
            const { error } = await supabase.from('blacklists').upsert({
                guild_id: interaction.guildId, target_id: targetId, target_type: targetType,
                reason, active: true, added_by: interaction.user.id, added_at: new Date().toISOString()
            }, { onConflict: 'guild_id,target_id' });

            if (error) return interaction.editReply({ content: 'Failed to add to blacklist.' });

            await logAction(interaction.client, {
                action: 'Blacklist Add', executor: interaction.user,
                extra: [{ name: 'Target', value: targetName ?? targetId, inline: true }, { name: 'Type', value: targetType, inline: true }, { name: 'Reason', value: reason }]
            });

            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Blacklist Updated')
                    .setDescription(`**${targetName ?? targetId}** has been added to the ticket blacklist.`)
                    .addFields({ name: 'Reason', value: reason }).setFooter({ text: 'DHS | Support System' })]
            });
        }

        if (sub === 'remove') {
            const { error } = await supabase.from('blacklists').update({ active: false }).eq('guild_id', interaction.guildId).eq('target_id', targetId);
            if (error) return interaction.editReply({ content: 'Failed to remove from blacklist.' });

            await logAction(interaction.client, {
                action: 'Blacklist Remove', executor: interaction.user,
                extra: [{ name: 'Target', value: targetName ?? targetId, inline: true }, { name: 'Type', value: targetType, inline: true }]
            });

            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Blacklist Updated')
                    .setDescription(`**${targetName ?? targetId}** has been removed from the ticket blacklist.`).setFooter({ text: 'DHS | Support System' })]
            });
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /claim
// ═══════════════════════════════════════════════════════════════════════════════
const claim = {
    data: new SlashCommandBuilder()
        .setName('claim')
        .setDescription('Claim this ticket as your own.'),

    async execute(interaction) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        if (!(await canUseCommand(interaction.guildId, 'claim', interaction.member))) return interaction.reply({ content: 'You do not have permission to claim tickets.', ephemeral: true });
        if (ticket.claimed_by) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(`This ticket is already claimed by <@${ticket.claimed_by}>.`).setFooter({ text: 'DHS | Support System' })], ephemeral: true });
        }

        await interaction.deferReply();

        if (process.env.ROLE_HR) await interaction.channel.permissionOverwrites.edit(process.env.ROLE_HR, { SendMessages: false }).catch(() => null);
        await interaction.channel.permissionOverwrites.edit(interaction.member, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => null);

        await supabase.from('tickets').update({ claimed_by: interaction.user.id }).eq('id', ticket.id);
        await logAction(interaction.client, { action: 'Ticket Claimed', executor: interaction.user, ticketId: ticket.ticket_id });

        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`<@${interaction.user.id}> has claimed this ticket.`).setFooter({ text: 'DHS | Support System' })],
            allowedMentions: { parse: [] }
        });
    },

    buttons: {
        'ticket:claim': async (interaction) => {
            const ticket = await getTicketByChannel(interaction.channelId);
            if (!ticket) return interaction.reply({ content: 'Ticket data not found.', ephemeral: true });
            if (!(await canUseCommand(interaction.guildId, 'claim', interaction.member))) return interaction.reply({ content: 'You need permission to claim tickets.', ephemeral: true });
            if (ticket.claimed_by) {
                return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(`Already claimed by <@${ticket.claimed_by}>.`).setFooter({ text: 'DHS | Support System' })], ephemeral: true });
            }

            if (process.env.ROLE_HR) await interaction.channel.permissionOverwrites.edit(process.env.ROLE_HR, { SendMessages: false }).catch(() => null);
            await interaction.channel.permissionOverwrites.edit(interaction.member, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => null);

            await supabase.from('tickets').update({ claimed_by: interaction.user.id }).eq('id', ticket.id);
            await logAction(interaction.client, { action: 'Ticket Claimed', executor: interaction.user, ticketId: ticket.ticket_id });

            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`<@${interaction.user.id}> has claimed this ticket.`).setFooter({ text: 'DHS | Support System' })],
                allowedMentions: { parse: [] }
            });
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /unclaim
// ═══════════════════════════════════════════════════════════════════════════════
const unclaim = {
    data: new SlashCommandBuilder()
        .setName('unclaim')
        .setDescription('Unclaim this ticket.'),

    async execute(interaction) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        if (!(await canUseCommand(interaction.guildId, 'unclaim', interaction.member))) return interaction.reply({ content: 'You do not have permission to unclaim tickets.', ephemeral: true });
        if (!ticket.claimed_by) return interaction.reply({ content: 'This ticket is not currently claimed.', ephemeral: true });

        if (ticket.claimed_by !== interaction.user.id && !isSHR(interaction.member)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(`This ticket is claimed by <@${ticket.claimed_by}>. You need SHR+ to unclaim another staff member's ticket.`).setFooter({ text: 'DHS | Support System' })],
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const prevClaimerId = ticket.claimed_by;

        if (process.env.ROLE_HR) await interaction.channel.permissionOverwrites.edit(process.env.ROLE_HR, { SendMessages: true }).catch(() => null);

        const prevMember = await interaction.guild.members.fetch(prevClaimerId).catch(() => null);
        if (prevMember) await interaction.channel.permissionOverwrites.delete(prevMember).catch(() => null);

        await supabase.from('tickets').update({ claimed_by: null }).eq('id', ticket.id);
        await logAction(interaction.client, {
            action: 'Ticket Unclaimed', executor: interaction.user, ticketId: ticket.ticket_id,
            extra: [{ name: 'Previously Claimed By', value: `<@${prevClaimerId}>`, inline: true }]
        });

        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xff9900).setTitle('Ticket Unclaimed').setDescription('This ticket has been unclaimed. Any support member may now claim it.').setFooter({ text: 'DHS | Support System' })],
            allowedMentions: { parse: [] }
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /close
// ═══════════════════════════════════════════════════════════════════════════════
const close = {
    data: new SlashCommandBuilder()
        .setName('close')
        .setDescription('Immediately close this ticket.')
        .addStringOption(o => o.setName('reason').setDescription('Reason for closing.').setRequired(false)),

    async execute(interaction) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        if (ticket.status === 'closed') return interaction.reply({ content: 'This ticket is already closed.', ephemeral: true });

        const isOwner = ticket.owner_id === interaction.user.id;
        if (!isOwner && !(await canUseCommand(interaction.guildId, 'close', interaction.member))) return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });

        const reason = interaction.options.getString('reason') ?? 'No reason provided.';
        await interaction.deferReply();
        await executeClose(interaction, ticket, reason);
    },

    buttons: {
        'ticket:close': async (interaction) => {
            const ticket = await getTicketByChannel(interaction.channelId);
            if (!ticket) return interaction.reply({ content: 'Ticket data not found.', ephemeral: true });

            const isOwner = ticket.owner_id === interaction.user.id;
            if (!isOwner && !(await canUseCommand(interaction.guildId, 'close', interaction.member))) return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });

            await interaction.deferReply();
            await executeClose(interaction, ticket, 'Closed via button.');
        },

        'ticket:closewithreason': async (interaction) => {
            const ticket = await getTicketByChannel(interaction.channelId);
            if (!ticket) return interaction.reply({ content: 'Ticket data not found.', ephemeral: true });

            const isOwner = ticket.owner_id === interaction.user.id;
            if (!isOwner && !(await canUseCommand(interaction.guildId, 'close', interaction.member))) return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });

            const modal = new ModalBuilder().setCustomId('ticket:closewithreason:modal').setTitle('Close Ticket With Reason');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('reason').setLabel('Reason for closing').setStyle(TextInputStyle.Paragraph).setRequired(true)
            ));
            await interaction.showModal(modal);
        },

        'ticket:closerequest:accept': async (interaction) => {
            const ticket = await getTicketByChannel(interaction.channelId);
            if (!ticket) return interaction.reply({ content: 'Ticket not found.', ephemeral: true });
            if (interaction.user.id !== ticket.owner_id) return interaction.reply({ content: 'Only the ticket opener can accept this close request.', ephemeral: true });

            await interaction.deferUpdate();
            await executeClose(interaction, ticket, 'Accepted close request.');
        },

        'ticket:closerequest:deny': async (interaction) => {
            const ticket = await getTicketByChannel(interaction.channelId);
            if (!ticket) return interaction.reply({ content: 'Ticket not found.', ephemeral: true });
            if (interaction.user.id !== ticket.owner_id) return interaction.reply({ content: 'Only the ticket opener can deny this close request.', ephemeral: true });

            await interaction.update({
                embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Close Request Denied').setDescription('The ticket opener has chosen to keep this ticket open.').setFooter({ text: 'DHS | Support System' })],
                components: []
            });
        },

        'ticket:editreason': async (interaction) => {
            const ticketDbId = interaction.customId.split(':')[2];
            const modal = new ModalBuilder().setCustomId(`ticket:editreason:modal:${ticketDbId}`).setTitle('Edit Close Reason');
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('reason').setLabel('New reason').setStyle(TextInputStyle.Paragraph).setRequired(true)
            ));
            await interaction.showModal(modal);
        }
    },

    modals: {
        'ticket:closewithreason:modal': async (interaction) => {
            const ticket = await getTicketByChannel(interaction.channelId);
            if (!ticket) return interaction.reply({ content: 'Ticket data not found.', ephemeral: true });

            const reason = interaction.fields.getTextInputValue('reason');
            await interaction.deferReply();
            await executeClose(interaction, ticket, reason);
        },

        'ticket:editreason:modal': async (interaction) => {
            const ticketDbId = interaction.customId.split(':')[3];
            const newReason  = interaction.fields.getTextInputValue('reason');

            const { error } = await supabase.from('tickets').update({ close_reason: newReason }).eq('id', ticketDbId);
            if (error) return interaction.reply({ content: 'Failed to update reason.', ephemeral: true });

            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Reason Updated').setDescription(`Close reason updated to:\n\`${newReason}\``).setFooter({ text: 'DHS | Support System' })],
                ephemeral: true
            });
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /closerequest
// ═══════════════════════════════════════════════════════════════════════════════
const closerequest = {
    data: new SlashCommandBuilder()
        .setName('closerequest')
        .setDescription('Request that the ticket opener closes this ticket.')
        .addStringOption(o => o.setName('reason').setDescription('Reason for the close request.').setRequired(false)),

    async execute(interaction) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        if (!(await canUseCommand(interaction.guildId, 'closerequest', interaction.member))) return interaction.reply({ content: 'You do not have permission to send a close request.', ephemeral: true });

        const reason = interaction.options.getString('reason') ?? 'No reason provided.';

        return interaction.reply({
            content: `<@${ticket.owner_id}>`,
            embeds: [
                new EmbedBuilder().setColor(0xff9900).setTitle('Close Request')
                    .setDescription(`<@${interaction.user.id}> has requested to close this ticket.\n\n**Reason:** ${reason}`)
                    .setFooter({ text: 'DHS | Support System' })
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('ticket:closerequest:accept').setLabel('Accept & Close').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('ticket:closerequest:deny').setLabel('Deny & Keep Open').setStyle(ButtonStyle.Secondary)
                )
            ],
            allowedMentions: { users: [ticket.owner_id] }
        });
    },

    buttons: {
        'ticket:closerequest': async (interaction) => {
            const ticket = await getTicketByChannel(interaction.channelId);
            if (!ticket) return interaction.reply({ content: 'Ticket data not found.', ephemeral: true });
            if (!(await canUseCommand(interaction.guildId, 'closerequest', interaction.member))) return interaction.reply({ content: 'You need permission to request ticket closure.', ephemeral: true });

            return interaction.reply({
                content: `<@${ticket.owner_id}>`,
                embeds: [
                    new EmbedBuilder().setColor(0xff9900).setTitle('Close Request')
                        .setDescription(`<@${interaction.user.id}> has requested to close this ticket.\n\n**Reason:** No reason provided.`)
                        .setFooter({ text: 'DHS | Support System' })
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('ticket:closerequest:accept').setLabel('Accept & Close').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId('ticket:closerequest:deny').setLabel('Deny & Keep Open').setStyle(ButtonStyle.Secondary)
                    )
                ],
                allowedMentions: { users: [ticket.owner_id] }
            });
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /panel
// ═══════════════════════════════════════════════════════════════════════════════
const panel = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Manage the DHS ticket panel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub => sub.setName('send').setDescription('Send the ticket panel to this channel.'))
        .addSubcommand(sub => sub.setName('edit').setDescription('Edit the existing ticket panel (no duplicates).')
            .addStringOption(o => o.setName('message_id').setDescription('Message ID of the existing panel.').setRequired(true))
        )
        .addSubcommand(sub => sub.setName('switch').setDescription("Switch this ticket's category.")
            .addStringOption(o => o.setName('category').setDescription('Category to switch to.').setRequired(true)
                .addChoices(
                    { name: "❓ General Inquiry's", value: 'general' },
                    { name: "📄 Appeal Inquiry's",  value: 'appeal'  },
                    { name: "🚨 Report Inquiry's",  value: 'report'  }
                )
            )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const configKey = sub === 'send' ? 'panel_send' : sub === 'edit' ? 'panel_edit' : 'panel_switch';

        if (!(await canUseCommand(interaction.guildId, configKey, interaction.member))) {
            return interaction.reply({ content: `You do not have permission to use \`/panel ${sub}\`.`, ephemeral: true });
        }

        // FIX: /panel switch is now a PUBLIC reply (visible to everyone in the
        // ticket, including the opener) instead of ephemeral. send/edit stay
        // ephemeral since those are admin-only setup actions in a staff channel.
        await interaction.deferReply({ ephemeral: sub !== 'switch' });

        if (sub === 'send') {
            const msg = await interaction.channel.send({ embeds: [buildPanelEmbed()], components: [buildPanelDropdown()] });
            await supabase.from('panels').upsert({ guild_id: interaction.guildId, channel_id: interaction.channelId, message_id: msg.id, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
            await logAction(interaction.client, { action: 'Panel Sent', executor: interaction.user, extra: { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true } });
            return interaction.editReply({ content: 'Panel sent successfully.' });
        }

        if (sub === 'edit') {
            const messageId = interaction.options.getString('message_id');
            const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
            if (!msg) return interaction.editReply({ content: 'Could not find that message in this channel.' });
            await msg.edit({ embeds: [buildPanelEmbed()], components: [buildPanelDropdown()] });
            await logAction(interaction.client, { action: 'Panel Edited', executor: interaction.user, extra: { name: 'Message ID', value: messageId, inline: true } });
            return interaction.editReply({ content: 'Panel updated successfully.' });
        }

        if (sub === 'switch') {
            const ticket = await getTicketByChannel(interaction.channelId);
            if (!ticket) return interaction.editReply({ content: 'This command can only be used inside a ticket channel.' });

            const category = interaction.options.getString('category');

            if (ticket.category === category) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(`This ticket is already set to **${CATEGORY_LABELS[category]}**.`).setFooter({ text: 'DHS | Support System' })]
                });
            }

            const recentMsgs = await interaction.channel.messages.fetch({ limit: 50 }).catch(() => null);
            const openMsg = recentMsgs?.find(m =>
                m.author?.id === interaction.client.user.id &&
                m.embeds?.[0]?.title &&
                Object.values(CATEGORY_TITLES).includes(m.embeds[0].title)
            );
            if (openMsg) {
                await openMsg.edit({ embeds: [buildCategoryEmbed(category)] }).catch(() => null);
            }

            const newParentId = process.env[`TICKET_CATEGORY_${category.toUpperCase()}`];
            if (newParentId) {
                await interaction.channel.setParent(newParentId, { lockPermissions: false }).catch(() => null);
            }

            const oldCategory = ticket.category;
            await supabase.from('tickets').update({ category }).eq('id', ticket.id);

            await logAction(interaction.client, {
                action: 'Panel Switch', executor: interaction.user, ticketId: ticket.ticket_id,
                extra: [
                    { name: 'Old Category', value: CATEGORY_LABELS[oldCategory] ?? oldCategory, inline: true },
                    { name: 'New Category', value: CATEGORY_LABELS[category] ?? category, inline: true }
                ]
            });

            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Ticket Category Switched')
                    .setDescription(`This ticket has been switched to: **${CATEGORY_LABELS[category] ?? category}**\nSwitched by: <@${interaction.user.id}>`)
                    .setFooter({ text: 'DHS | Support System' })]
            });
        }
    },

    selectMenus: {
        'ticket:panel:select': async (interaction) => {
            await interaction.deferReply({ ephemeral: true });

            const category = interaction.values[0];
            const guild    = interaction.guild;
            const opener   = interaction.member;

            const blocked = await isBlacklisted(guild.id, opener);
            if (blocked) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('Access Denied').setDescription('You are currently blacklisted from opening tickets.').setFooter({ text: 'DHS | Support System' })]
                });
            }

            const { data: openInCategory } = await supabase.from('tickets').select('channel_id').eq('guild_id', guild.id).eq('owner_id', opener.id).eq('category', category).eq('status', 'open');
            if (openInCategory && openInCategory.length >= 2) {
                const links = openInCategory.map(t => `<#${t.channel_id}>`).join(' and ');
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('Ticket Limit Reached').setDescription(`You already have 2 open tickets in this category: ${links}\nClose one before opening another.`).setFooter({ text: 'DHS | Support System' })]
                });
            }

            const { data: ticketNum, error: numErr } = await supabase.rpc('increment_ticket_counter', { p_guild_id: guild.id });
            if (numErr) {
                console.error('[DHS Tickets] Counter RPC error:', numErr);
                return interaction.editReply({ content: 'Failed to create ticket. Please try again.' });
            }

            const ticketId    = `ticket-${ticketNum}`;
            const channelName = `ticket-${ticketNum}`;

            const ticketChannel = await guild.channels.create({
                name:                 channelName,
                type:                 ChannelType.GuildText,
                parent:               process.env[`TICKET_CATEGORY_${category.toUpperCase()}`] || null,
                permissionOverwrites: buildTicketOverwrites(guild, opener.id),
                reason:               `Ticket opened by ${opener.user.tag ?? opener.user.username}`
            }).catch(err => { console.error('[DHS Tickets] Channel create error:', err); return null; });

            if (!ticketChannel) return interaction.editReply({ content: 'Failed to create ticket channel. Check bot permissions.' });

            const openEmbed = buildCategoryEmbed(category);

            const hrId   = process.env.ROLE_HR;
            const shrId  = process.env.ROLE_SHR;
            const lsId   = process.env.ROLE_LS;
            const execId = process.env.ROLE_EXEC;
            const ping   = `||<@${opener.id}>${hrId ? ` <@&${hrId}>` : ''}${shrId ? ` <@&${shrId}>` : ''}||`;

            await ticketChannel.send({
                content: ping, embeds: [openEmbed], components: [buildTicketActionRow()],
                allowedMentions: { users: [opener.id], roles: [hrId, shrId, lsId, execId].filter(Boolean) }
            });

            const { error: dbErr } = await supabase.from('tickets').insert({
                guild_id: guild.id, channel_id: ticketChannel.id, owner_id: opener.id,
                category, status: 'open', ticket_id: ticketId, ticket_num: ticketNum,
                claimed_by: null, opened_at: new Date().toISOString()
            });
            if (dbErr) console.error('[DHS Tickets] Supabase insert error:', dbErr);

            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Ticket Opened').setDescription(`Opened a new ticket <#${ticketChannel.id}>`).setFooter({ text: 'DHS | Support System' })]
            });
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /remove
// ═══════════════════════════════════════════════════════════════════════════════
const remove = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a user from this ticket.')
        .addUserOption(o => o.setName('user').setDescription('User to remove.').setRequired(true)),

    async execute(interaction) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        if (!(await canUseCommand(interaction.guildId, 'remove', interaction.member))) return interaction.reply({ content: 'You do not have permission to remove users from tickets.', ephemeral: true });

        const target = interaction.options.getMember('user');
        if (!target) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        if (target.id === ticket.owner_id) return interaction.reply({ content: 'You cannot remove the ticket opener.', ephemeral: true });

        await interaction.channel.permissionOverwrites.delete(target);
        await logAction(interaction.client, { action: 'User Removed from Ticket', executor: interaction.user, target: target.user, ticketId: ticket.ticket_id });

        return interaction.reply({
            embeds: [new EmbedBuilder().setColor(0xff9900).setDescription(`<@${target.id}> has been removed from this ticket.`).setFooter({ text: 'DHS | Support System' })],
            allowedMentions: { parse: [] }
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /rename
// ═══════════════════════════════════════════════════════════════════════════════
const rename = {
    data: new SlashCommandBuilder()
        .setName('rename')
        .setDescription('Rename this ticket channel.')
        .addStringOption(o => o.setName('name').setDescription('New channel name.').setRequired(true)),

    async execute(interaction) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        if (!(await canUseCommand(interaction.guildId, 'rename', interaction.member))) return interaction.reply({ content: 'You do not have permission to rename tickets.', ephemeral: true });

        const name = interaction.options.getString('name').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        if (!name) return interaction.reply({ content: 'Invalid channel name. Use letters, numbers, and hyphens only.', ephemeral: true });

        const oldName = interaction.channel.name;
        await interaction.channel.setName(name);
        await logAction(interaction.client, { action: 'Ticket Renamed', executor: interaction.user, ticketId: ticket.ticket_id, extra: [{ name: 'Old Name', value: oldName, inline: true }, { name: 'New Name', value: name, inline: true }] });

        return interaction.reply({
            embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`Channel renamed from \`${oldName}\` to \`${name}\`.`).setFooter({ text: 'DHS | Support System' })]
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /transfer
// ═══════════════════════════════════════════════════════════════════════════════
const transfer = {
    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('Transfer this ticket\'s claim to another staff member.')
        .addUserOption(o => o.setName('user').setDescription('Staff member to transfer the claim to.').setRequired(true)),

    async execute(interaction) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        if (!ticket.claimed_by) return interaction.reply({ content: 'This ticket has not been claimed yet. Use /claim first.', ephemeral: true });

        const isCurrentClaimer = ticket.claimed_by === interaction.user.id;
        const hasBasePerm = await canUseCommand(interaction.guildId, 'transfer', interaction.member);
        if (!hasBasePerm && !(isHR(interaction.member) && isCurrentClaimer)) {
            return interaction.reply({ content: 'You do not have permission to transfer this ticket. SHR+ can transfer any claimed ticket; HR can only transfer a ticket they have claimed.', ephemeral: true });
        }

        const target = interaction.options.getMember('user');
        if (!target) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        if (target.user.bot) return interaction.reply({ content: 'Cannot transfer a ticket to a bot.', ephemeral: true });
        if (!isHR(target)) return interaction.reply({ content: 'You can only transfer the claim to another staff member (HR+).', ephemeral: true });
        if (target.id === ticket.claimed_by) return interaction.reply({ content: 'That user already has this ticket claimed.', ephemeral: true });

        await interaction.deferReply();

        const prevClaimerId = ticket.claimed_by;

        const prevMember = await interaction.guild.members.fetch(prevClaimerId).catch(() => null);
        if (prevMember) await interaction.channel.permissionOverwrites.delete(prevMember).catch(() => null);

        await interaction.channel.permissionOverwrites.edit(target, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => null);

        await supabase.from('tickets').update({ claimed_by: target.id }).eq('id', ticket.id);
        await logAction(interaction.client, {
            action: 'Ticket Claim Transferred', executor: interaction.user, target: target.user, ticketId: ticket.ticket_id,
            extra: { name: 'Previous Claimer', value: `<@${prevClaimerId}>`, inline: true }
        });

        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(EMBED_COLOR)
                .setDescription(`This ticket's claim has been transferred from <@${prevClaimerId}> to <@${target.id}>. <@${target.id}> is now handling this ticket.`)
                .setFooter({ text: 'DHS | Support System' })],
            allowedMentions: { parse: [] }
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /jump
// ═══════════════════════════════════════════════════════════════════════════════
const jump = {
    data: new SlashCommandBuilder()
        .setName('jump')
        .setDescription('Jump to the start of this ticket.'),

    async execute(interaction) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });

        const firstBatch = await interaction.channel.messages.fetch({ limit: 1, after: '0' }).catch(() => null);
        const firstMsg   = firstBatch?.first();

        if (!firstMsg) {
            return interaction.reply({ content: 'Could not locate the start of this ticket.', ephemeral: true });
        }

        const link = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${firstMsg.id}`;

        return interaction.reply({
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Jump to Start').setStyle(ButtonStyle.Link).setURL(link)
            )],
            ephemeral: true
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /config
//  SHR+ only (SHR, LS, Executive) can run /config and VIEW any command's
//  allowed roles, shown as clean @role mentions.
//
//  Editing (add/remove a role) requires BOTH:
//    1. Meeting the editor-tier baseline — SHR+ for most commands, LS+ only
//       for panel_send / panel_edit.
//    2. Actually being able to USE that command right now (per the live
//       canUseCommand check). This is what makes "if Executive/SHR is
//       removed from being able to use a command, they also lose the
//       ability to manage that command's config" work correctly.
// ═══════════════════════════════════════════════════════════════════════════════
async function canEditCommandConfig(guildId, commandName, member) {
    const meetsEditorTier = LS_ONLY_EDIT_COMMANDS.has(commandName) ? isLS(member) : isSHR(member);
    if (!meetsEditorTier) return false;
    return canUseCommand(guildId, commandName, member);
}

async function buildConfigPayload(guild, commandName, member) {
    const { roleIds, isCustom } = await getEffectiveCommandRoles(guild.id, commandName);
    const editPermitted = await canEditCommandConfig(guild.id, commandName, member);

    const roleLines = roleIds.length
        ? roleIds.map(id => `<@&${id}>`).join('\n')
        : '*No roles currently have permission to use this command.*';

    const displayName = COMMAND_DISPLAY_NAMES[commandName] ?? commandName;
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`Command Config — /${displayName}`)
        .setDescription(`The following roles currently have permission to use **/${displayName}** in tickets:\n\n${roleLines}`)
        .setFooter({ text: isCustom ? 'DHS | Support System • Custom configuration' : 'DHS | Support System • Default configuration' });

    if (LS_ONLY_EDIT_COMMANDS.has(commandName) && !editPermitted) {
        embed.addFields({ name: 'Note', value: 'Only LS+ may modify permissions for this command. You can view, but not edit, this configuration.' });
    } else if (!editPermitted) {
        embed.addFields({ name: 'Note', value: 'You no longer have permission to use this command yourself, so you cannot manage its configuration either.' });
    }

    const components = [];
    if (editPermitted) {
        // FIX: previously used a RoleSelectMenuBuilder for "add a role", which
        // silently failed ("This interaction failed", nothing in the console)
        // — almost certainly because the bot's interaction router doesn't
        // recognize the Role Select Menu component type. Switched to a
        // StringSelectMenu listing the guild's roles instead, which uses the
        // exact same interaction type as the working "remove a role" menu
        // below, so it's guaranteed to route correctly.
        const addableRoles = [...guild.roles.cache
            .filter(r => r.id !== guild.id && !r.managed && !roleIds.includes(r.id))
            .values()]
            .sort((a, b) => b.position - a.position)
            .slice(0, 25);

        if (addableRoles.length > 0) {
            components.push(new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`config:add:${commandName}`)
                    .setPlaceholder('Add a role with permission to use this command')
                    .addOptions(addableRoles.map(r => new StringSelectMenuOptionBuilder().setLabel(r.name).setValue(r.id)))
            ));
        }

        if (roleIds.length > 0) {
            const removeOptions = roleIds.slice(0, 25).map(id => {
                const role = guild.roles.cache.get(id);
                return new StringSelectMenuOptionBuilder()
                    .setLabel(role ? role.name : `Unknown Role (${id})`)
                    .setValue(id);
            });
            components.push(new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`config:remove:${commandName}`)
                    .setPlaceholder('Remove a role\'s permission for this command')
                    .addOptions(removeOptions)
            ));
        }
    }

    return { embeds: [embed], components, ephemeral: true };
}

const config = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription("View or edit which roles can use the ticket system's commands.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(o => o.setName('command').setDescription('Command to view/configure.').setRequired(true)
            .addChoices(...COMMAND_LIST.map(c => ({ name: COMMAND_DISPLAY_NAMES[c] ?? c, value: c })))
        ),

    async execute(interaction) {
        if (!isSHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to view command configuration.', ephemeral: true });

        const commandName = interaction.options.getString('command');
        const payload = await buildConfigPayload(interaction.guild, commandName, interaction.member);
        return interaction.reply(payload);
    },

    selectMenus: {
        'config:add': async (interaction) => {
            if (!isSHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to edit command configuration.', ephemeral: true });

            const commandName = interaction.customId.split(':')[2];
            if (!(await canEditCommandConfig(interaction.guildId, commandName, interaction.member))) {
                return interaction.reply({ content: `You do not have permission to modify permissions for /${COMMAND_DISPLAY_NAMES[commandName] ?? commandName}.`, ephemeral: true });
            }

            const roleId = interaction.values[0];

            // Upsert the real role grant AND the meta sentinel row together —
            // this is what marks the command as "customized" so that removing
            // every role later doesn't silently fall back to the defaults.
            const { error } = await supabase.from('command_permissions').upsert([
                { guild_id: interaction.guildId, command_name: commandName, role_id: CONFIG_META_ROLE_ID, added_by: interaction.user.id, added_at: new Date().toISOString() },
                { guild_id: interaction.guildId, command_name: commandName, role_id: roleId, added_by: interaction.user.id, added_at: new Date().toISOString() },
            ], { onConflict: 'guild_id,command_name,role_id' });

            if (error) {
                console.error('[DHS Tickets] config:add upsert error:', error);
                return interaction.reply({ content: `Failed to update configuration: ${error.message ?? 'unknown error'}`, ephemeral: true });
            }

            await logAction(interaction.client, {
                action: 'Command Config Updated', executor: interaction.user,
                extra: [{ name: 'Command', value: `/${COMMAND_DISPLAY_NAMES[commandName] ?? commandName}`, inline: true }, { name: 'Role Added', value: `<@&${roleId}>`, inline: true }]
            });

            const payload = await buildConfigPayload(interaction.guild, commandName, interaction.member);
            return interaction.update(payload);
        },

        'config:remove': async (interaction) => {
            if (!isSHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to edit command configuration.', ephemeral: true });

            const commandName = interaction.customId.split(':')[2];
            if (!(await canEditCommandConfig(interaction.guildId, commandName, interaction.member))) {
                return interaction.reply({ content: `You do not have permission to modify permissions for /${COMMAND_DISPLAY_NAMES[commandName] ?? commandName}.`, ephemeral: true });
            }

            const roleId = interaction.values[0];

            // Only the specific role row is deleted — the meta sentinel row
            // (role_id = '__configured__') is left untouched, which is what
            // keeps the command "locked" to the remaining custom roles even
            // if this was the very last one.
            const { error } = await supabase.from('command_permissions')
                .delete()
                .eq('guild_id', interaction.guildId)
                .eq('command_name', commandName)
                .eq('role_id', roleId);

            if (error) {
                console.error('[DHS Tickets] config:remove delete error:', error);
                return interaction.reply({ content: `Failed to update configuration: ${error.message ?? 'unknown error'}`, ephemeral: true });
            }

            await logAction(interaction.client, {
                action: 'Command Config Updated', executor: interaction.user,
                extra: [{ name: 'Command', value: `/${COMMAND_DISPLAY_NAMES[commandName] ?? commandName}`, inline: true }, { name: 'Role Removed', value: `<@&${roleId}>`, inline: true }]
            });

            const payload = await buildConfigPayload(interaction.guild, commandName, interaction.member);
            return interaction.update(payload);
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORT — array of all commands
// ═══════════════════════════════════════════════════════════════════════════════
export const commands = [add, blacklist, claim, unclaim, close, closerequest, panel, remove, rename, transfer, jump, config];
