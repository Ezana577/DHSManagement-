export const buttons = {
    payoutreceipt: async (interaction) => {
        const payoutId = interaction.customId.split(':')[1];
        const entry = payoutCache.get(payoutId);

        if (!entry) {
            return interaction.reply({
                embeds: [errorEmbed('This payroll receipt has expired or no longer exists.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (interaction.user.id !== entry.initiatorId) {
            return interaction.reply({
                embeds: [errorEmbed('Only the person who processed this payroll can view the receipt.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        const receiptEmbed = new EmbedBuilder()
            .setColor(0xd4af37)
            .setAuthor({ name: 'DHS Payroll Receipt', iconURL: interaction.client.user.displayAvatarURL() })
            .setTitle('Official Payroll Receipt')
            .setThumbnail(entry.targetAvatar)
            .addFields(
                { name: 'Agent', value: `<@${entry.targetId}>`, inline: false },
                { name: 'Hours Worked', value: `${entry.hours} hour${entry.hours !== 1 ? 's' : ''}`, inline: true },
                { name: 'Minutes Worked', value: `${entry.minutes} minute${entry.minutes !== 1 ? 's' : ''}`, inline: true },
                { name: '\u200b', value: '\u200b', inline: false },
                { name: 'Hour Rate', value: `$${fmt(RATE_HOUR)} / hr`, inline: true },
                { name: 'Minute Rate', value: `$${fmt(RATE_MINUTE)} / min`, inline: true },
                { name: '\u200b', value: '\u200b', inline: false },
                { name: 'Base Pay', value: `$${fmt(entry.basePay)}`, inline: true },
                { name: 'AOTW Bonus', value: entry.aotw ? `+$${fmt(AOTW_BONUS)}` : 'None', inline: true },
                { name: '\u200b', value: '\u200b', inline: false },
                { name: 'Final Total', value: `**$${fmt(entry.total)}**`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Department of Homeland Security • Payroll' });

        await interaction.reply({ 
            embeds: [receiptEmbed], 
            flags: MessageFlags.Ephemeral 
        });
        
        const disabledButton = new ButtonBuilder()
            .setCustomId('receipt_viewed')
            .setLabel('Receipt Viewed')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);

        const disabledRow = new ActionRowBuilder().addComponents(disabledButton);
        
        await interaction.message.edit({ components: [disabledRow] }).catch(() => null);

        payoutCache.delete(payoutId);
    },
};