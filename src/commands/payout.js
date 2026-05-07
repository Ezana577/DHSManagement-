import {
    SlashCommandBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    MessageFlags,
} from 'discord.js';

const ALLOWED_ROLE = '1447274909775691959';
const LOG_CHANNEL_ID = '1400610140406808768';
const RATE_HOUR = 3_000_000;
const RATE_MINUTE = 50_000;
const AOTW_BONUS = 10_000_000;

const payoutCache = new Map();

const fmt = (n) => n.toLocaleString('en-US');

const errorEmbed = (description) =>
    new EmbedBuilder()
        .setColor(0xc0392b)
        .setAuthor({ name: 'DHS Payroll System' })
        .setDescription(`> ${description}`)
        .setTimestamp()
        .setFooter({ text: 'Department of Homeland Security • Payroll' });

export const data = new SlashCommandBuilder()
    .setName('payout')
    .setDescription('Process a DHS payroll payout for an agent.')
    .addUserOption((o) =>
        o.setName('user').setDescription('The agent to pay out.').setRequired(true)
    )
    .addIntegerOption((o) =>
        o.setName('hours').setDescription('Hours worked.').setRequired(true).setMinValue(0)
    )
    .addIntegerOption((o) =>
        o.setName('minutes').setDescription('Minutes worked (0–59).').setRequired(true).setMinValue(0).setMaxValue(59)
    )
    .addBooleanOption((o) =>
        o.setName('aotw').setDescription('Award Agent of the Week bonus?').setRequired(true)
    );

export async function execute(interaction) {
    const executor = interaction.member;

    if (!executor.roles.cache.has(ALLOWED_ROLE)) {
        return interaction.reply({
            embeds: [errorEmbed('You do not have permission to use this command.')],
            flags: MessageFlags.Ephemeral,
        });
    }

    const targetUser = interaction.options.getUser('user');
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    const hours = interaction.options.getInteger('hours');
    const minutes = interaction.options.getInteger('minutes');
    const aotw = interaction.options.getBoolean('aotw');

    if (!targetMember || !targetMember.roles.cache.has(ALLOWED_ROLE)) {
        return interaction.reply({
            embeds: [errorEmbed('This person is not a DHS agent.')],
            flags: MessageFlags.Ephemeral,
        });
    }

    if (hours < 2) {
        return interaction.reply({
            embeds: [errorEmbed('You are not eligible for a payout. You must have **2+ hours** to receive DHS payment.')],
            flags: MessageFlags.Ephemeral,
        });
    }

    const basePay = hours * RATE_HOUR + minutes * RATE_MINUTE;
    const aotwBonus = aotw ? AOTW_BONUS : 0;
    const total = basePay + aotwBonus;
    const payoutId = `${interaction.id}`;

    payoutCache.set(payoutId, {
        targetId: targetUser.id,
        targetTag: targetUser.tag,
        targetAvatar: targetUser.displayAvatarURL({ dynamic: true }),
        hours,
        minutes,
        aotw,
        initiatorId: interaction.user.id,
        basePay,
        aotwBonus,
        total,
    });

    const eligibleEmbed = new EmbedBuilder()
        .setColor(0xd4af37)
        .setAuthor({ name: 'DHS Payroll System', iconURL: interaction.client.user.displayAvatarURL() })
        .setTitle('Payout Eligible')
        .setDescription(
            `<@${targetUser.id}> is eligible for a DHS payroll payout.\n\nUse the button below to view the full payroll receipt.`
        )
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: 'Estimated Total', value: `**$${fmt(total)}**`, inline: true },
            { name: 'Processed By', value: `<@${interaction.user.id}>`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Department of Homeland Security • Payroll' });

    const receiptButton = new ButtonBuilder()
        .setCustomId(`payoutreceipt:${payoutId}`)
        .setLabel('View Payroll Receipt')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(receiptButton);

    await interaction.reply({ embeds: [eligibleEmbed], components: [row] });

    const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (logChannel) {
        const logEmbed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setAuthor({ name: 'Payroll Initiated', iconURL: interaction.user.displayAvatarURL() })
            .addFields(
                { name: 'Initiated By', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: false },
                { name: 'Agent', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: false },
                { name: 'Shift Time', value: `${hours}h ${minutes}m`, inline: true },
                { name: 'AOTW', value: aotw ? 'Yes' : 'No', inline: true },
                { name: 'Final Total', value: `$${fmt(total)}`, inline: true },
                { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'DHS Payroll Logs' });

        await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
    }
}

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