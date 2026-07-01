// ═══════════════════════════════════════════════════════════════════════════════
//  DHS TICKET SYSTEM — ALL COMMANDS IN ONE FILE
//  Commands: /add /blacklist /claim /unclaim /close /closerequest
//            /panel /remove /rename /transfer /jump
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
    PermissionFlagsBits,
    ChannelType,
} from 'discord.js';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ─── Constants ────────────────────────────────────────────────────────────────
const EMBED_COLOR       = 0x1d72d7;
const PANEL_BANNER      = 'https://cdn.discordapp.com/attachments/1400947813365584025/1520632307864698990/9C652B65-D0C3-4EDE-BD57-3EBAF88A1D91.png?ex=6a41e6b2&is=6a409532&hm=ea2c38fd45634bd4ee9a8335f3a7c84c5eb0976bb5ef9c98a9ead0483c6784b9&';
const LOG_CHANNEL_ID    = process.env.LOG_CHANNEL_ID       || '1400610140406808768';
const CLOSE_LOG_CHANNEL = process.env.CLOSE_LOG_CHANNEL_ID || '1400610094412070934';

// ─── Permissions — HR+ cascades through SHR, Executive, LS ────────────────────
function hasRole(member, ...ids) { return ids.some(id => id && member.roles.cache.has(id)); }
function isLS(member)   { return hasRole(member, process.env.ROLE_LS); }
function isExec(member) { return hasRole(member, process.env.ROLE_LS, process.env.ROLE_EXEC); }
function isSHR(member)  { return hasRole(member, process.env.ROLE_LS, process.env.ROLE_EXEC, process.env.ROLE_SHR); }
function isHR(member)   { return hasRole(member, process.env.ROLE_LS, process.env.ROLE_EXEC, process.env.ROLE_SHR, process.env.ROLE_HR); }

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
    for (const roleId of [process.env.ROLE_HR, process.env.ROLE_SHR, process.env.ROLE_EXEC, process.env.ROLE_LS]) {
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
        .setTitle("❓ General Inquiry's")
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
        .setTitle("📄 Appeal Inquiry's")
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
        .setTitle("🚨 Report Inquiry's")
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

function buildEmbedForCategory(category) {
    if (category === 'general') return buildGeneralEmbed();
    if (category === 'appeal')  return buildAppealEmbed();
    return buildReportEmbed();
}

// ─── Ticket action buttons (sent inside every ticket on open) ─────────────────
function buildTicketActionRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ticket:closerequest').setLabel('Request Close').setStyle(ButtonStyle.Secondary),
    );
}

// ─── Panel embed ──────────────────────────────────────────────────────────────
function buildPanelEmbed() {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('# Department Of Homeland Security')
        .setDescription(
            'Welcome to the Department of Homeland Security Support Center. ' +
            'Please select the category below that best matches your request.'
        )
        .addFields(
            { name: '❓ General Inquiries',  value: '> • Questions or concerns\n> • Redeem a prize\n> • General assistance',                          inline: false },
            { name: '📄 Appeals',            value: '> • Appeal a punishment\n> • Appeal a Ticket Blacklist\n> • Request a case review',              inline: false },
            { name: '🚨 Reports',            value: '> • Report an agent\n> • Report misconduct\n> • Submit supporting evidence',                     inline: false },
            { name: '⚠️ Warning',            value: 'Please do not submit false, duplicate, or troll tickets. Abuse may result in a Ticket Blacklist or disciplinary action.', inline: false }
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

// ─── Transcript generator — uploads to Supabase Storage, returns public URL ───
async function generateTranscript(ticketChannel, ticketId) {
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

    // Upload directly to Supabase Storage — NOT sent as a Discord file attachment.
    // This is what stops the raw .html file from appearing above the log embed.
    const key = `transcripts/${ticketId}-${Date.now()}.html`;
    const { error } = await supabase.storage.from('transcripts').upload(key, Buffer.from(html, 'utf-8'), {
        contentType: 'text/html', upsert: true
    });
    if (error) {
        console.error('[DHS Transcript] Upload error:', error);
        return null;
    }
    const { data: urlData } = supabase.storage.from('transcripts').getPublicUrl(key);
    return urlData?.publicUrl ?? null;
}

// ─── Core close logic (shared by /close, button close, closerequest accept) ───
async function executeClose(interaction, ticket, reason) {
    const channel = interaction.channel;
    const guild   = interaction.guild;

    const transcriptUrl = await generateTranscript(channel, ticket.ticket_id);

    const now        = new Date();
    const openedUnix = Math.floor(new Date(ticket.opened_at).getTime() / 1000);
    const closedUnix = Math.floor(now.getTime() / 1000);
    const claimedBy  = ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Unclaimed';

    await supabase.from('tickets').update({
        status: 'closed', closed_by: interaction.user.id,
        closed_at: now.toISOString(), close_reason: reason, transcript_url: transcriptUrl
    }).eq('id', ticket.id);

    await logAction(interaction.client, { action: 'Ticket Closed', executor: interaction.user, ticketId: ticket.ticket_id, reason });

    // ── Closure log embed — ONLY the embed + buttons, no raw file ──────────────
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

    const logRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket:editreason:${ticket.id}`).setLabel('Edit Reason').setStyle(ButtonStyle.Secondary)
    );
    if (transcriptUrl) {
        logRow.addComponents(new ButtonBuilder().setLabel('View Transcript').setStyle(ButtonStyle.Link).setURL(transcriptUrl));
    }

    const logChannel = guild.channels.cache.get(CLOSE_LOG_CHANNEL);
    if (logChannel) {
        await logChannel.send({ embeds: [logEmbed], components: [logRow], allowedMentions: { parse: [] } }).catch(() => null);
    }

    // ── DM ticket opener ──────────────────────────────────────────────────────
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
        if (!isHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to add users to tickets.', ephemeral: true });

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
        if (!isSHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to manage the blacklist.', ephemeral: true });

        const sub        = interaction.options.getSubcommand();
        const user       = interaction.options.getUser('user');
        const role       = interaction.options.getRole('role');
        const reason     = interaction.options.getString('reason') ?? 'No reason provided.';
        const targetId   = user?.id ?? role?.id;
        const targetType = user ? 'user' : role ? 'role' : null;
        const targetName = user?.tag ?? user?.username ?? role?.name;

        if (!targetId) return interaction.reply({ content: 'Provide a user or role.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        if (sub === 'add') {
            const { error } = await supabase.from('blacklists').upsert({
                guild_id: interaction.guildId, target_id: targetId, target_type: targetType,
                reason, active: true, added_by: interaction.user.id, added_at: new Date().toISOString()
            }, { onConflict: 'guild_id,target_id' });

            if (error) {
                console.error('[DHS Blacklist] Add error:', error);
                return interaction.editReply({ content: 'Failed to add to blacklist.' });
            }

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
            if (error) {
                console.error('[DHS Blacklist] Remove error:', error);
                return interaction.editReply({ content: 'Failed to remove from blacklist.' });
            }

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
        if (!isHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to claim tickets.', ephemeral: true });
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
            if (!isHR(interaction.member)) return interaction.reply({ content: 'You need HR+ to claim tickets.', ephemeral: true });
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
        if (!isHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to unclaim tickets.', ephemeral: true });
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
        if (!isOwner && !isHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });

        const reason = interaction.options.getString('reason') ?? 'No reason provided.';
        await interaction.deferReply();
        await executeClose(interaction, ticket, reason);
    },

    buttons: {
        'ticket:close': async (interaction) => {
            const ticket = await getTicketByChannel(interaction.channelId);
            if (!ticket) return interaction.reply({ content: 'Ticket data not found.', ephemeral: true });

            const isOwner = ticket.owner_id === interaction.user.id;
            if (!isOwner && !isHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });

            await interaction.deferReply();
            await executeClose(interaction, ticket, 'Closed via button.');
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
        if (!isHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to send a close request.', ephemeral: true });

        const reason = interaction.options.getString('reason') ?? 'No reason provided.';

        return interaction.reply({
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
            ]
        });
    },

    buttons: {
        'ticket:closerequest': async (interaction) => {
            const ticket = await getTicketByChannel(interaction.channelId);
            if (!ticket) return interaction.reply({ content: 'Ticket data not found.', ephemeral: true });
            if (!isHR(interaction.member)) return interaction.reply({ content: 'You need HR+ to request ticket closure.', ephemeral: true });

            return interaction.reply({
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
                ]
            });
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /sendpanel  /editpanel  /switchpanel
// ═══════════════════════════════════════════════════════════════════════════════
const sendpanel = {
    data: new SlashCommandBuilder()
        .setName('sendpanel')
        .setDescription('Send the DHS ticket panel to this channel.'),

    async execute(interaction) {
        if (!isLS(interaction.member)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription('You do not have permission to use `/sendpanel`. This requires LS+.').setFooter({ text: 'DHS | Support System' })],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const msg = await interaction.channel.send({ embeds: [buildPanelEmbed()], components: [buildPanelDropdown()] });
        await supabase.from('panels').upsert({ guild_id: interaction.guildId, channel_id: interaction.channelId, message_id: msg.id, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
        await logAction(interaction.client, { action: 'Panel Sent', executor: interaction.user, extra: { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true } });
        return interaction.editReply({ content: 'Panel sent successfully.' });
    }
};

const editpanel = {
    data: new SlashCommandBuilder()
        .setName('editpanel')
        .setDescription('Edit the existing DHS ticket panel in place.')
        .addStringOption(o => o.setName('message_id').setDescription('Message ID of the existing panel.').setRequired(true)),

    async execute(interaction) {
        if (!isLS(interaction.member)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription('You do not have permission to use `/editpanel`. This requires LS+.').setFooter({ text: 'DHS | Support System' })],
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const messageId = interaction.options.getString('message_id');
        const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);
        if (!msg) return interaction.editReply({ content: 'Could not find that message in this channel.' });

        await msg.edit({ embeds: [buildPanelEmbed()], components: [buildPanelDropdown()] });
        await logAction(interaction.client, { action: 'Panel Edited', executor: interaction.user, extra: { name: 'Message ID', value: messageId, inline: true } });
        return interaction.editReply({ content: 'Panel updated successfully.' });
    }
};

const switchpanel = {
    data: new SlashCommandBuilder()
        .setName('switchpanel')
        .setDescription("Switch this ticket's category.")
        .addStringOption(o => o.setName('category').setDescription('Category to switch to.').setRequired(true)
            .addChoices(
                { name: "❓ General Inquiry's", value: 'general' },
                { name: "📄 Appeal Inquiry's",  value: 'appeal'  },
                { name: "🚨 Report Inquiry's",  value: 'report'  }
            )
        ),

    async execute(interaction) {
        if (!isHR(interaction.member)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription('You do not have permission to use `/switchpanel`. This requires HR+.').setFooter({ text: 'DHS | Support System' })],
                ephemeral: true
            });
        }

        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        if (ticket.status === 'closed') return interaction.reply({ content: 'This ticket is already closed.', ephemeral: true });

        const category = interaction.options.getString('category');

        if (ticket.category === category) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(`This ticket is already set to **${CATEGORY_LABELS[category]}**.`).setFooter({ text: 'DHS | Support System' })],
                ephemeral: true
            });
        }

        await interaction.deferReply();

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
                .setDescription(`This ticket has been switched to: **${CATEGORY_LABELS[category] ?? category}**
Switched by: <@${interaction.user.id}>`)
                .setFooter({ text: 'DHS | Support System' })]
        });
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
        if (!isHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to remove users from tickets.', ephemeral: true });

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
        if (!isHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to rename tickets.', ephemeral: true });

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
//  Transfers CLAIM/HANDLER status, NOT ticket ownership (opener never changes).
//  SHR+ can transfer any claimed ticket. HR can only transfer a ticket THEY claimed.
//  Old claimer (if HR) loses send access; new claimer gets it.
// ═══════════════════════════════════════════════════════════════════════════════
const transfer = {
    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('Transfer the handler of this ticket to another support member.')
        .addUserOption(o => o.setName('user').setDescription('Staff member to transfer the claim to.').setRequired(true)),

    async execute(interaction) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
        if (!isHR(interaction.member)) return interaction.reply({ content: 'You do not have permission to transfer tickets.', ephemeral: true });

        if (!ticket.claimed_by) {
            return interaction.reply({ content: 'This ticket is not currently claimed. Use `/claim` first.', ephemeral: true });
        }

        // HR can only transfer their OWN claimed ticket; SHR+ can transfer any
        if (ticket.claimed_by !== interaction.user.id && !isSHR(interaction.member)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(`This ticket is claimed by <@${ticket.claimed_by}>. You need SHR+ to transfer a ticket you didn't claim.`).setFooter({ text: 'DHS | Support System' })],
                ephemeral: true
            });
        }

        const target = interaction.options.getMember('user');
        if (!target) return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        if (target.id === ticket.claimed_by) return interaction.reply({ content: 'That user already has this ticket claimed.', ephemeral: true });
        if (target.user.bot) return interaction.reply({ content: 'Cannot transfer a ticket to a bot.', ephemeral: true });
        if (!isHR(target)) return interaction.reply({ content: 'You can only transfer tickets to HR+ staff members.', ephemeral: true });

        await interaction.deferReply();

        const oldClaimerId = ticket.claimed_by;

        // Remove old claimer's individual send override so they fall back to the
        // (locked) HR role permission and can no longer speak in the ticket
        const oldClaimerMember = await interaction.guild.members.fetch(oldClaimerId).catch(() => null);
        if (oldClaimerMember) {
            await interaction.channel.permissionOverwrites.delete(oldClaimerMember).catch(() => null);
        }

        // Ensure HR role stays locked (in case it wasn't already)
        if (process.env.ROLE_HR) {
            await interaction.channel.permissionOverwrites.edit(process.env.ROLE_HR, { SendMessages: false }).catch(() => null);
        }

        // Give new claimer explicit access
        await interaction.channel.permissionOverwrites.edit(target, {
            ViewChannel: true, SendMessages: true, ReadMessageHistory: true
        }).catch(() => null);

        await supabase.from('tickets').update({ claimed_by: target.id }).eq('id', ticket.id);
        await logAction(interaction.client, {
            action: 'Ticket Claim Transferred', executor: interaction.user, target: target.user, ticketId: ticket.ticket_id,
            extra: { name: 'Previous Handler', value: `<@${oldClaimerId}>`, inline: true }
        });

        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setDescription(`This ticket has been transferred from <@${oldClaimerId}> to <@${target.id}>. <@${target.id}> is now the ticket handler.`).setFooter({ text: 'DHS | Support System' })],
            allowedMentions: { parse: [] }
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  /jump — runs INSIDE a ticket, jumps to the original opening embed of THAT ticket
// ═══════════════════════════════════════════════════════════════════════════════
const jump = {
    data: new SlashCommandBuilder()
        .setName('jump')
        .setDescription('Get a jump button to the start of this ticket.'),

    async execute(interaction) {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription('This command can only be used inside a ticket channel.').setFooter({ text: 'DHS | Support System' })],
                ephemeral: true
            });
        }

        // Find the original category embed message (first bot message with a category title)
        const messages = await interaction.channel.messages.fetch({ limit: 50 }).catch(() => null);
        const categoryTitles = ["❓ General Inquiry's", "📄 Appeal Inquiry's", "🚨 Report Inquiry's"];
        const originalMsg = messages?.reverse().find(m =>
            m.author.id === interaction.client.user.id &&
            m.embeds[0]?.title && categoryTitles.includes(m.embeds[0].title)
        );

        if (!originalMsg) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription('Could not find the opening message for this ticket.').setFooter({ text: 'DHS | Support System' })],
                ephemeral: true
            });
        }

        const jumpUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${originalMsg.id}`;

        return interaction.reply({
            embeds: [new EmbedBuilder().setColor(EMBED_COLOR).setTitle('Jump to Ticket Start').setDescription('Click the button below to jump to the beginning of this ticket.').setFooter({ text: 'DHS | Support System' })],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Jump to Start').setStyle(ButtonStyle.Link).setURL(jumpUrl)
                )
            ],
            ephemeral: true
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORT — array of all commands
// ═══════════════════════════════════════════════════════════════════════════════
export const commands = [add, blacklist, claim, unclaim, close, closerequest, sendpanel, editpanel, switchpanel, remove, rename, transfer, jump];
