// ─────────────────────────────────────────────────────────────
//  /closerequest
//  HR+ can initiate; only the ticket opener decides outcome.
// ─────────────────────────────────────────────────────────────

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { isHR } from '../utils/permissions.js';
import { getTicketByChannel, buildCloseRequestEmbed, buildCloseRequestRow } from '../utils/ticketHelpers.js';

export const data = new SlashCommandBuilder()
    .setName('closerequest')
    .setDescription('Request that the ticket opener closes this ticket.')
    .addStringOption(opt =>
        opt.setName('reason').setDescription('Reason for the close request.').setRequired(false)
    );

export async function execute(interaction) {
    const ticket = await getTicketByChannel(interaction.channelId);
    if (!ticket) {
        return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
    }

    if (!isHR(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to send a close request.', ephemeral: true });
    }

    const reason = interaction.options.getString('reason') || 'No reason provided.';

    await interaction.reply({
        embeds: [buildCloseRequestEmbed(interaction.user.id, reason)],
        components: [buildCloseRequestRow()]
    });
}
