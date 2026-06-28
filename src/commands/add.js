// ─────────────────────────────────────────────────────────────
//  /add  — Add a user to the current ticket channel.
//  HR+ only.
// ─────────────────────────────────────────────────────────────

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { isHR } from '../utils/permissions.js';
import { getTicketByChannel, EMBED_COLOR } from '../utils/ticketHelpers.js';
import { logAction } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a user to this ticket.')
    .addUserOption(opt =>
        opt.setName('user').setDescription('User to add.').setRequired(true)
    );

export async function execute(interaction) {
    const ticket = await getTicketByChannel(interaction.channelId);
    if (!ticket) {
        return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
    }

    if (!isHR(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to add users to tickets.', ephemeral: true });
    }

    const target = interaction.options.getMember('user');
    if (!target) {
        return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    }

    await interaction.channel.permissionOverwrites.create(target, {
        ViewChannel:        true,
        SendMessages:       true,
        ReadMessageHistory: true
    });

    await logAction(interaction.client, {
        action:   'User Added to Ticket',
        executor: interaction.user,
        target:   target.user,
        ticketId: ticket.ticket_id
    });

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('User Added')
                .setDescription(`<@${target.id}> has been added to this ticket.`)
        ]
    });
}
