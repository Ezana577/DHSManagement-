// ─────────────────────────────────────────────────────────────
//  /rename  — HR+ can rename the ticket channel.
// ─────────────────────────────────────────────────────────────

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isHR } from '../utils/permissions.js';
import { getTicketByChannel, EMBED_COLOR } from '../utils/ticketHelpers.js';
import { logAction } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename this ticket channel.')
    .addStringOption(opt =>
        opt.setName('name').setDescription('New channel name (no spaces).').setRequired(true)
    );

export async function execute(interaction) {
    const ticket = await getTicketByChannel(interaction.channelId);
    if (!ticket) {
        return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
    }

    if (!isHR(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to rename tickets.', ephemeral: true });
    }

    const name = interaction.options.getString('name')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

    if (!name) {
        return interaction.reply({ content: 'Invalid channel name.', ephemeral: true });
    }

    const oldName = interaction.channel.name;
    await interaction.channel.setName(name);

    await logAction(interaction.client, {
        action:   'Ticket Renamed',
        executor: interaction.user,
        ticketId: ticket.ticket_id,
        extra: [
            { name: 'Old Name', value: oldName, inline: true },
            { name: 'New Name', value: name,    inline: true }
        ]
    });

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('Ticket Renamed')
                .setDescription(`Channel renamed to **${name}**.`)
        ]
    });
}
