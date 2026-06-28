// ─────────────────────────────────────────────────────────────
//  /transfer  — HR+ can transfer ticket ownership to another user.
// ─────────────────────────────────────────────────────────────

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import supabase from '../utils/supabase.js';
import { isHR } from '../utils/permissions.js';
import { getTicketByChannel, EMBED_COLOR } from '../utils/ticketHelpers.js';
import { logAction } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer ticket ownership to another user.')
    .addUserOption(opt =>
        opt.setName('user').setDescription('New ticket owner.').setRequired(true)
    );

export async function execute(interaction) {
    const ticket = await getTicketByChannel(interaction.channelId);
    if (!ticket) {
        return interaction.reply({ content: 'This command can only be used inside a ticket channel.', ephemeral: true });
    }

    if (!isHR(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to transfer tickets.', ephemeral: true });
    }

    const target = interaction.options.getMember('user');
    if (!target) {
        return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    }

    if (target.id === ticket.owner_id) {
        return interaction.reply({ content: 'That user is already the ticket owner.', ephemeral: true });
    }

    const oldOwnerId = ticket.owner_id;

    // Remove old owner's override, add new owner
    await interaction.channel.permissionOverwrites.delete(oldOwnerId).catch(() => null);
    await interaction.channel.permissionOverwrites.create(target, {
        ViewChannel:        true,
        SendMessages:       true,
        ReadMessageHistory: true
    });

    // Update Supabase
    await supabase.from('tickets').update({ owner_id: target.id }).eq('id', ticket.id);

    await logAction(interaction.client, {
        action:   'Ticket Transferred',
        executor: interaction.user,
        target:   target.user,
        ticketId: ticket.ticket_id,
        extra:    { name: 'Previous Owner', value: `<@${oldOwnerId}>`, inline: true }
    });

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setTitle('Ticket Transferred')
                .setDescription(`Ticket ownership transferred to <@${target.id}>.`)
        ]
    });
}
