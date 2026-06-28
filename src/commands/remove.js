// ─────────────────────────────────────────────────────────────
//  /remove  — Remove a user from the current ticket channel.
//  HR+ only. Cannot remove the ticket opener.
// ─────────────────────────────────────────────────────────────

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isHR } from '../utils/permissions.js';
import { getTicketByChannel, EMBED_COLOR } from '../utils/ticketHelpers.js';
import { logAction } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a user from this ticket.')
    .addUserOption(opt =>
        opt.setName('user').setDescription('User to remove.').setRequired(true)
    );

export async function execute(interaction) {
    const ticket = await getTicketByChannel(interaction.channelId);
    if (!ticket) {
        return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
    }

    if (!isHR(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to remove users from tickets.', ephemeral: true });
    }

    const target = interaction.options.getMember('user');
    if (!target) {
        return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    }

    if (target.id === ticket.owner_id) {
        return interaction.reply({ content: 'You cannot remove the ticket opener.', ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.delete(target);

    await logAction(interaction.client, {
        action:   'User Removed from Ticket',
        executor: interaction.user,
        target:   target.user,
        ticketId: ticket.ticket_id
    });

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('User Removed')
                .setDescription(`<@${target.id}> has been removed from this ticket.`)
        ]
    });
}
