// ─────────────────────────────────────────────────────────────
//  /claim  |  /unclaim
//  HR+ can claim; SHR+ can unclaim.
// ─────────────────────────────────────────────────────────────

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import supabase from '../utils/supabase.js';
import { isHR, isSHR } from '../utils/permissions.js';
import { getTicketByChannel, EMBED_COLOR } from '../utils/ticketHelpers.js';
import { logAction } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim this ticket as your own.');

export async function execute(interaction) {
    const ticket = await getTicketByChannel(interaction.channelId);
    if (!ticket) {
        return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
    }

    if (!isHR(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to claim tickets.', ephemeral: true });
    }

    if (ticket.claimed_by) {
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0xe74c3c)
                    .setTitle('Already Claimed')
                    .setDescription(`This ticket is already claimed by <@${ticket.claimed_by}>.`)
            ],
            ephemeral: true
        });
    }

    await supabase.from('tickets').update({ claimed_by: interaction.user.id }).eq('id', ticket.id);

    await logAction(interaction.client, {
        action:   'Ticket Claimed',
        executor: interaction.user,
        ticketId: ticket.ticket_id
    });

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('Ticket Claimed')
                .setDescription(`This ticket has been claimed by <@${interaction.user.id}>.`)
        ]
    });
}
