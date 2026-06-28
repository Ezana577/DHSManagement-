// ─────────────────────────────────────────────────────────────
//  /blacklist add | remove
//  SHR+ only. Prevents users from opening tickets.
// ─────────────────────────────────────────────────────────────

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import supabase from '../utils/supabase.js';
import { isSHR } from '../utils/permissions.js';
import { EMBED_COLOR } from '../utils/ticketHelpers.js';
import { logAction } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Manage the ticket blacklist.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
        sub.setName('add')
            .setDescription('Blacklist a user or role from opening tickets.')
            .addUserOption(opt =>
                opt.setName('user').setDescription('User to blacklist.').setRequired(false)
            )
            .addRoleOption(opt =>
                opt.setName('role').setDescription('Role to blacklist.').setRequired(false)
            )
            .addStringOption(opt =>
                opt.setName('reason').setDescription('Reason for blacklisting.').setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName('remove')
            .setDescription('Remove a user or role from the ticket blacklist.')
            .addUserOption(opt =>
                opt.setName('user').setDescription('User to unblacklist.').setRequired(false)
            )
            .addRoleOption(opt =>
                opt.setName('role').setDescription('Role to unblacklist.').setRequired(false)
            )
    );

export async function execute(interaction) {
    if (!isSHR(interaction.member)) {
        return interaction.reply({ content: 'You do not have permission to manage the blacklist.', ephemeral: true });
    }

    const sub    = interaction.options.getSubcommand();
    const user   = interaction.options.getUser('user');
    const role   = interaction.options.getRole('role');
    const reason = interaction.options.getString('reason');

    const targetId   = user?.id   ?? role?.id;
    const targetType = user ? 'user' : role ? 'role' : null;
    const targetTag  = user?.tag  ?? role?.name;

    if (!targetId) {
        return interaction.reply({ content: 'Provide a user or role to blacklist.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    if (sub === 'add') {
        const { error } = await supabase.from('blacklists').upsert({
            guild_id:    interaction.guildId,
            target_id:   targetId,
            target_type: targetType,
            reason:      reason || 'No reason provided.',
            active:      true,
            added_by:    interaction.user.id,
            added_at:    new Date().toISOString()
        }, { onConflict: 'guild_id,target_id' });

        if (error) {
            console.error('[DHS Blacklist] Add error:', error);
            return interaction.editReply({ content: 'Failed to add to blacklist.' });
        }

        await logAction(interaction.client, {
            action:   'Blacklist Add',
            executor: interaction.user,
            extra: [
                { name: 'Target',      value: targetTag || targetId,       inline: true },
                { name: 'Target Type', value: targetType,                  inline: true },
                { name: 'Reason',      value: reason || 'No reason provided.' }
            ]
        });

        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('Blacklist Updated')
                    .setDescription(`${targetTag || targetId} has been added to the ticket blacklist.`)
                    .addFields({ name: 'Reason', value: reason || 'No reason provided.' })
            ]
        });
    }

    if (sub === 'remove') {
        const { error } = await supabase.from('blacklists')
            .update({ active: false })
            .eq('guild_id', interaction.guildId)
            .eq('target_id', targetId);

        if (error) {
            console.error('[DHS Blacklist] Remove error:', error);
            return interaction.editReply({ content: 'Failed to remove from blacklist.' });
        }

        await logAction(interaction.client, {
            action:   'Blacklist Remove',
            executor: interaction.user,
            extra: [
                { name: 'Target',      value: targetTag || targetId, inline: true },
                { name: 'Target Type', value: targetType,            inline: true }
            ]
        });

        return interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(EMBED_COLOR)
                    .setTitle('Blacklist Updated')
                    .setDescription(`${targetTag || targetId} has been removed from the ticket blacklist.`)
            ]
        });
    }
}
