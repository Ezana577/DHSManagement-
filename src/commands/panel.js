// ─────────────────────────────────────────────────────────────
//  /panel  |  /panel edit  |  /panel switch
//  Sends or edits the DHS ticket panel embed.
// ─────────────────────────────────────────────────────────────

import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    PermissionFlagsBits
} from 'discord.js';
import supabase from '../utils/supabase.js';
import { logAction } from '../utils/logger.js';
import { isHR } from '../utils/permissions.js';
import { EMBED_COLOR } from '../utils/ticketHelpers.js';

const PANEL_BANNER = 'https://cdn.discordapp.com/attachments/1400947813365584025/1520632307864698990/9C652B65-D0C3-4EDE-BD57-3EBAF88A1D91.png?ex=6a41e6b2&is=6a409532&hm=ea2c38fd45634bd4ee9a8335f3a7c84c5eb0976bb5ef9c98a9ead0483c6784b9&';

export const data = new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Manage the DHS ticket panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub =>
        sub.setName('send').setDescription('Send the ticket panel to this channel.')
    )
    .addSubcommand(sub =>
        sub.setName('edit').setDescription('Edit the existing ticket panel.')
            .addStringOption(opt =>
                opt.setName('message_id').setDescription('Message ID of the existing panel.').setRequired(true)
            )
    )
    .addSubcommand(sub =>
        sub.setName('switch').setDescription('Switch the category of this ticket.')
            .addStringOption(opt =>
                opt.setName('category')
                    .setDescription('Category to switch this ticket to.')
                    .setRequired(true)
                    .addChoices(
                        { name: "❓ General Inquiry's", value: 'general' },
                        { name: "📄 Appeal Inquiry's",  value: 'appeal'  },
                        { name: "🚨 Report Inquiry's",  value: 'report'  }
                    )
            )
    );

function buildPanelEmbed() {
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
     .setDescription(
`# Department Of Homeland Security Scupport Center!

> Welcome to the Department of Homeland Security Support Center. Please select the category below that best matches your request.`
)
        .addFields(
            {
                name: '❓ General Inquiries',
                value: '> • Questions or concerns\n> • Redeem a prize\n> • General assistance',
                inline: false
            },
            {
                name: '📄 Appeals',
                value: '> • Appeal a punishment\n> • Appeal a Ticket Blacklist\n> • Request a case review',
                inline: false
            },
            {
                name: '🚨 Reports',
                value: '> • Report an agent\n> • Report misconduct\n> • Submit supporting evidence',
                inline: false
            },
            {
                name: '‼️ Warning',
                value: ' > -# Please do not submit false, duplicate, or troll tickets. Abuse may result in a Ticket Blacklist or disciplinary action.',
                inline: false
            }
        )
        .setImage(PANEL_BANNER)
        .setFooter({ text: 'DHS | Support System' });
}

function buildPanelDropdown() {
    const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket:panel:select')
        .setPlaceholder('Select a category to open a ticket.')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("General Inquiry's")
                .setValue('general')
                .setDescription('Questions, prizes, and general assistance.'),
            new StringSelectMenuOptionBuilder()
                .setLabel("Appeal Inquiry's")
                .setValue('appeal')
                .setDescription('Appeal punishments, blacklists, or request case reviews.'),
            new StringSelectMenuOptionBuilder()
                .setLabel("Report Inquiry's")
                .setValue('report')
                .setDescription('Report an agent, misconduct, or submit evidence.')
        );

    return new ActionRowBuilder().addComponents(menu);
}

export async function execute(interaction) {
    if (!isHR(interaction.member)) {
        return interaction.reply({
            content: 'You do not have permission to manage the panel.',
            ephemeral: true
        });
    }

    const sub = interaction.options.getSubcommand();

    // ── /panel send ──────────────────────────────────────────
    if (sub === 'send') {
        await interaction.deferReply({ ephemeral: true });

        const msg = await interaction.channel.send({
            embeds: [buildPanelEmbed()],
            components: [buildPanelDropdown()]
        });

        await supabase.from('panels').upsert({
            guild_id:   interaction.guildId,
            channel_id: interaction.channelId,
            message_id: msg.id,
            updated_at: new Date().toISOString()
        }, { onConflict: 'guild_id' });

        await logAction(interaction.client, {
            action:   'Panel Sent',
            executor: interaction.user,
            extra:    { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true }
        });

        return interaction.editReply({ content: 'Panel sent successfully.' });
    }

    // ── /panel edit ──────────────────────────────────────────
    if (sub === 'edit') {
        await interaction.deferReply({ ephemeral: true });

        const messageId = interaction.options.getString('message_id');
        const msg = await interaction.channel.messages.fetch(messageId).catch(() => null);

        if (!msg) {
            return interaction.editReply({ content: 'Could not find that message in this channel.' });
        }

        await msg.edit({
            embeds: [buildPanelEmbed()],
            components: [buildPanelDropdown()]
        });

        await logAction(interaction.client, {
            action:   'Panel Edited',
            executor: interaction.user,
            extra:    { name: 'Message ID', value: messageId, inline: true }
        });

        return interaction.editReply({ content: 'Panel updated successfully.' });
    }

    // ── /panel switch ─────────────────────────────────────────
    // HR+ only. Changes the active category for NEW tickets only.
    // Does NOT affect any existing open tickets.
    if (sub === 'switch') {
        await interaction.deferReply({ ephemeral: true });

        const category = interaction.options.getString('category');

        // Block switching to the same category that's already active
        const { data: current } = await supabase
            .from('panel_settings')
            .select('default_category')
            .eq('guild_id', interaction.guildId)
            .maybeSingle();

        if (current?.default_category === category) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setTitle('No Change')
                        .setDescription(`The panel is already set to **${categoryLabel(category)}**.`)
                        .setFooter({ text: 'DHS | Support System' })
                ]
            });
        }

        await supabase.from('panel_settings').upsert({
            guild_id:         interaction.guildId,
            default_category: category,
            updated_by:       interaction.user.id,
            updated_at:       new Date().toISOString()
        }, { onConflict: 'guild_id' });

        const label = categoryLabel(category);

        await logAction(interaction.client, {
            action:   'Panel Switch',
            executor: interaction.user,
            extra: [{ name: 'New Default Category', value: label, inline: true }]
        });

        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('Ticket Panel Switch')
                    .setDescription(
                        `This ticket panel has been switched to: **${label}**\n` +
                        `Switched by: <@${interaction.user.id}>`
                    )
                    .setFooter({ text: 'DHS | Support System' })
            ]
        });
    }
}

function categoryLabel(value) {
    return {
        general: "❓ General Inquiry's",
        appeal:  "📄 Appeal Inquiry's",
        report:  "🚨 Report Inquiry's"
    }[value] ?? value;
}

// ── Dropdown handler ───────────────────────────────────────────
export const buttons = {
    'ticket:panel:select': async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const category = interaction.values[0];
        const guild    = interaction.guild;
        const opener   = interaction.user;

        // Blacklist check
        const { data: blacklist } = await supabase
            .from('blacklists')
            .select('id')
            .eq('guild_id', guild.id)
            .eq('target_id', opener.id)
            .eq('active', true)
            .maybeSingle();

        if (blacklist) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setTitle('Access Denied')
                        .setDescription('You are currently blacklisted from opening tickets.')
                        .setFooter({ text: 'DHS | Support System' })
                ]
            });
        }

        // Duplicate open ticket check
        const { data: existingTickets } = await supabase
            .from('tickets')
            .select('channel_id')
            .eq('guild_id', guild.id)
            .eq('owner_id', opener.id)
            .eq('status', 'open');

        if (existingTickets && existingTickets.length > 0) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setTitle('Ticket Already Open')
                        .setDescription(`You already have an open ticket: <#${existingTickets[0].channel_id}>`)
                        .setFooter({ text: 'DHS | Support System' })
                ]
            });
        }

        // Get next ticket number via RPC
        const { data: ticketNum, error: numErr } = await supabase
            .rpc('increment_ticket_counter', { p_guild_id: guild.id });

        if (numErr) {
            console.error('[DHS Tickets] Failed to get ticket number:', numErr);
            return interaction.editReply({ content: 'Failed to create ticket. Please try again.' });
        }

        const ticketId    = `ticket-${ticketNum}`;
        const channelName = `ticket-${ticketNum}`;

        const { buildTicketOverwrites, buildGeneralEmbed, buildReportEmbed, buildAppealEmbed } = await import('../utils/ticketHelpers.js');
        const overwrites = buildTicketOverwrites(guild, opener.id);

        const ticketChannel = await guild.channels.create({
            name:                 channelName,
            parent:               process.env[`TICKET_CATEGORY_${category.toUpperCase()}`] || null,
            permissionOverwrites: overwrites,
            reason:               `Ticket opened by ${opener.tag}`
        }).catch(err => {
            console.error('[DHS Tickets] Channel create error:', err);
            return null;
        });

        if (!ticketChannel) {
            return interaction.editReply({ content: 'Failed to create ticket channel. Check bot permissions.' });
        }

        let openEmbed;
        if (category === 'general')      openEmbed = buildGeneralEmbed();
        else if (category === 'report')  openEmbed = buildReportEmbed();
        else                             openEmbed = buildAppealEmbed();

        await ticketChannel.send({
            content: `<@${opener.id}>`,
            embeds: [openEmbed]
        });

        const { error: dbErr } = await supabase
            .from('tickets')
            .insert({
                guild_id:   guild.id,
                channel_id: ticketChannel.id,
                owner_id:   opener.id,
                category,
                status:     'open',
                ticket_id:  ticketId,
                ticket_num: ticketNum,
                claimed_by: null,
                opened_at:  new Date().toISOString()
            });

        if (dbErr) {
            console.error('[DHS Tickets] Supabase insert error:', dbErr);
        }

        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('Ticket')
                    .setDescription(`Opened a new ticket ${ticketId}`)
                    .setFooter({ text: 'DHS | Support System' })
            ]
        });
    }
};
