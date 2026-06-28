// ─────────────────────────────────────────────────────────────
//  /close  |  /closerequest
//  Handles ticket closure flow with transcript + logging.
// ─────────────────────────────────────────────────────────────

import {
    SlashCommandBuilder,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} from 'discord.js';
import supabase from '../utils/supabase.js';
import { logClosure } from '../utils/logger.js';
import { generateTranscript } from '../utils/transcript.js';
import { isHR, isSHR } from '../utils/permissions.js';
import {
    getTicketByChannel,
    buildCloseRequestEmbed,
    buildCloseRequestRow,
    EMBED_COLOR
} from '../utils/ticketHelpers.js';

// ── Shared close execution ─────────────────────────────────
async function executeClose(interaction, ticket, reason, closedBy) {
    const client  = interaction.client;
    const channel = interaction.channel;
    const guild   = interaction.guild;

    // Generate transcript first, before channel is deleted
    const logChannelId  = process.env.CLOSE_LOG_CHANNEL_ID || '1400610094412070934';
    const logChannel    = guild.channels.cache.get(logChannelId);
    let transcriptUrl   = null;

    if (logChannel) {
        transcriptUrl = await generateTranscript(channel, logChannel, ticket.ticket_id);
    } else {
        console.error('[DHS Close] Close log channel not found:', logChannelId);
    }

    // Update Supabase
    await supabase.from('tickets').update({
        status:          'closed',
        closed_by:       closedBy.id,
        closed_at:       new Date().toISOString(),
        close_reason:    reason || 'No reason provided.',
        transcript_url:  transcriptUrl
    }).eq('id', ticket.id);

    // Determine if opener still has access (i.e. still in guild)
    const opener = await guild.members.fetch(ticket.owner_id).catch(() => null);
    const canEdit = !!opener;

    // Send closure log
    await logClosure(client, {
        ticketId:      ticket.ticket_id,
        openedBy:      ticket.owner_id,
        closedBy:      closedBy.id,
        openTime:      new Date(ticket.opened_at).toLocaleString('en-US', { timeZoneName: 'short' }),
        reason:        reason || 'No reason provided.',
        transcriptUrl,
        canEditReason: canEdit,
        ticketDbId:    ticket.id
    });

    // DM transcript to opener if still accessible
    if (opener) {
        const dmEmbed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle('Your Ticket Has Been Closed')
            .addFields(
                { name: 'Ticket ID', value: ticket.ticket_id, inline: true },
                { name: 'Reason',    value: reason || 'No reason provided.' }
            );

        const dmComponents = [];
        if (transcriptUrl) {
            const { ActionRowBuilder: AR, ButtonBuilder: BB, ButtonStyle: BS } = await import('discord.js');
            dmComponents.push(
                new AR().addComponents(
                    new BB().setLabel('View Transcript').setStyle(BS.Link).setURL(transcriptUrl)
                )
            );
        }

        opener.user.send({ embeds: [dmEmbed], components: dmComponents }).catch(() => {
            console.warn(`[DHS Close] Could not DM transcript to ${ticket.owner_id}`);
        });
    }

    // Delete channel after short delay
    await new Promise(r => setTimeout(r, 3000));
    await channel.delete(`Ticket closed by ${closedBy.tag}`).catch(err =>
        console.error('[DHS Close] Channel delete error:', err)
    );
}

// ── /close ─────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
    .setName('close')
    .setDescription('Immediately close this ticket.')
    .addStringOption(opt =>
        opt.setName('reason').setDescription('Reason for closing.').setRequired(false)
    );

export async function execute(interaction) {
    const ticket = await getTicketByChannel(interaction.channelId);
    if (!ticket) {
        return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
    }

    const member = interaction.member;
    const isOwner = ticket.owner_id === interaction.user.id;

    if (!isOwner && !isHR(member)) {
        return interaction.reply({ content: 'You do not have permission to close this ticket.', ephemeral: true });
    }

    await interaction.deferReply();
    const reason = interaction.options.getString('reason') || 'No reason provided.';

    await executeClose(interaction, ticket, reason, interaction.user);
}

// ── /closerequest ──────────────────────────────────────────
export const data2 = new SlashCommandBuilder()
    .setName('closerequest')
    .setDescription('Request that the ticket opener closes this ticket.')
    .addStringOption(opt =>
        opt.setName('reason').setDescription('Reason for the close request.').setRequired(false)
    );

// Export a second command; we merge them both via an array export at the bottom.
// Actually Discord.js requires one data per file — we split closerequest into its own file.
// This file exports /close. See closerequest.js for /closerequest.

// ── Button Handlers ───────────────────────────────────────
export const buttons = {
    'ticket:closerequest:accept': async (interaction) => {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'No active ticket found.', ephemeral: true });

        // Only the ticket opener can accept
        if (interaction.user.id !== ticket.owner_id) {
            return interaction.reply({ content: 'Only the ticket opener can accept this close request.', ephemeral: true });
        }

        await interaction.deferUpdate();
        await executeClose(interaction, ticket, 'Accepted close request.', interaction.user);
    },

    'ticket:closerequest:deny': async (interaction) => {
        const ticket = await getTicketByChannel(interaction.channelId);
        if (!ticket) return interaction.reply({ content: 'No active ticket found.', ephemeral: true });

        // Only the ticket opener can deny
        if (interaction.user.id !== ticket.owner_id) {
            return interaction.reply({ content: 'Only the ticket opener can deny this close request.', ephemeral: true });
        }

        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('Close Request Denied')
                    .setDescription('The ticket opener has chosen to keep this ticket open.')
            ],
            components: []
        });
    },

    // Edit reason button from the closure log
    'ticket:editreason': async (interaction) => {
        const parts    = interaction.customId.split(':');
        const ticketDbId = parts[2];

        const modal = new ModalBuilder()
            .setCustomId(`ticket:editreason:modal:${ticketDbId}`)
            .setTitle('Edit Close Reason');

        const input = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('New reason')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    }
};

export const modals = {
    'ticket:editreason:modal': async (interaction) => {
        const parts      = interaction.customId.split(':');
        const ticketDbId = parts[3];
        const newReason  = interaction.fields.getTextInputValue('reason');

        const { error } = await supabase
            .from('tickets')
            .update({ close_reason: newReason })
            .eq('id', ticketDbId);

        if (error) {
            return interaction.reply({ content: 'Failed to update reason.', ephemeral: true });
        }

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('Reason Updated')
                    .setDescription(`The close reason has been updated to:\n${newReason}`)
            ],
            ephemeral: true
        });
    }
};
