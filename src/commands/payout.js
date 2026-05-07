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

const fmt = (n) => n.toLocaleString('en-US');

const errorEmbed = (description) =>
  new EmbedBuilder()
    .setColor(0xc0392b)
    .setAuthor({ name: 'DHS Payroll System' })
    .setDescription(`> ${description}`)
    .setTimestamp()
    .setFooter({ text: 'Department of Homeland Security • Payroll' });

const payoutCache = new Map();

export const data = new SlashCommandBuilder()
  .setName('payout')
  .setDescription('Process a DHS payroll payout for an agent.')

  .addUserOption((o) =>
    o
      .setName('user')
      .setDescription('The agent to pay out.')
      .setRequired(true)
  )

  .addIntegerOption((o) =>
    o
      .setName('hours')
      .setDescription('Hours worked.')
      .setRequired(true)
      .setMinValue(0)
  )

  .addIntegerOption((o) =>
    o
      .setName('minutes')
      .setDescription('Minutes worked (0–59).')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(59)
  )

  .addBooleanOption((o) =>
    o
      .setName('aotw')
      .setDescription('Award Agent of the Week bonus?')
      .setRequired(true)
  );

export async function execute(interaction) {
  const executor = interaction.member;

  // Permission check
  if (!executor.roles.cache.has(ALLOWED_ROLE)) {
    return interaction.reply({
      embeds: [errorEmbed('You do not have permission to use this command.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const targetUser = interaction.options.getUser('user');
  const targetMember = await interaction.guild.members
    .fetch(targetUser.id)
    .catch(() => null);

  const hours = interaction.options.getInteger('hours');
  const minutes = interaction.options.getInteger('minutes');
  const aotw = interaction.options.getBoolean('aotw');

  // DHS role check
  if (!targetMember || !targetMember.roles.cache.has(ALLOWED_ROLE)) {
    return interaction.reply({
      embeds: [errorEmbed('This person is not a DHS agent.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Minimum payout requirement
  if (hours < 2) {
    return interaction.reply({
      embeds: [
        errorEmbed(
          'You are not eligible for a payout. You must have **2+ hours** to receive DHS payment.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Safety validation
  if (minutes > 59) {
    return interaction.reply({
      embeds: [errorEmbed('Minutes cannot exceed 59.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Calculations
  const basePay = hours * RATE_HOUR + minutes * RATE_MINUTE;
  const aotwBonus = aotw ? AOTW_BONUS : 0;
  const total = basePay + aotwBonus;

  // Generate short secure ID
  const payoutId = Math.floor(Math.random() * 999999).toString();

  payoutCache.set(payoutId, {
    targetId: targetUser.id,
    hours,
    minutes,
    aotw,
    initiatorId: interaction.user.id,
    basePay,
    aotwBonus,
    total,
  });

  // Eligible embed
  const eligibleEmbed = new EmbedBuilder()
    .setColor(0xd4af37)
    .setAuthor({
      name: 'DHS Payroll System',
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setTitle('Payout Eligible')
    .setDescription(
      `<@${targetUser.id}> is eligible for a payout.\n\nPress the button below to view the full payroll receipt.`
    )
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .addFields({
      name: 'Estimated Total',
      value: `**$${fmt(total)}**`,
      inline: true,
    })
    .setTimestamp()
    .setFooter({
      text: 'Department of Homeland Security • Payroll',
    });

  // Button
  const viewButton = new ButtonBuilder()
    .setCustomId(`payout_${payoutId}`)
    .setLabel('View Payout Details')
    .setStyle(ButtonStyle.Primary);

  const row =
    new ActionRowBuilder().addComponents(viewButton);

  await interaction.reply({
    embeds: [eligibleEmbed],
    components: [row],
  });

  // Logs
  const logChannel = await interaction.client.channels
    .fetch(LOG_CHANNEL_ID)
    .catch(() => null);

  if (!logChannel) return;

  const logEmbed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setAuthor({
      name: 'Payroll Initiated',
      iconURL: interaction.user.displayAvatarURL(),
    })
    .addFields(
      {
        name: 'Initiated By',
        value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`,
        inline: false,
      },
      {
        name: 'Agent',
        value: `<@${targetUser.id}> (\`${targetUser.id}\`)`,
        inline: false,
      },
      {
        name: 'Hours',
        value: `${hours}h ${minutes}m`,
        inline: true,
      },
      {
        name: 'AOTW',
        value: aotw ? 'Yes' : 'No',
        inline: true,
      },
      {
        name: 'Total',
        value: `$${fmt(total)}`,
        inline: true,
      },
      {
        name: 'Channel',
        value: `<#${interaction.channel.id}>`,
        inline: false,
      }
    )
    .setTimestamp()
    .setFooter({
      text: 'DHS Payroll Log',
    });

  await logChannel.send({
    embeds: [logEmbed],
  });
}

export const buttons = {
  payout: async (interaction) => {
    const payoutId = interaction.customId.split('_')[1];

    const data = payoutCache.get(payoutId);

    if (!data) {
      return interaction.reply({
        embeds: [errorEmbed('This payout receipt expired or no longer exists.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Only initiator can view
    if (interaction.user.id !== data.initiatorId) {
      return interaction.reply({
        embeds: [
          errorEmbed(
            'Only the person who ran this command can view the receipt.'
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const receiptEmbed = new EmbedBuilder()
      .setColor(0xd4af37)
      .setAuthor({
        name: 'DHS Payroll Receipt',
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTitle('Payroll Receipt')
      .addFields(
        {
          name: 'Agent',
          value: `<@${data.targetId}>`,
          inline: false,
        },
        {
          name: 'Hours Worked',
          value: `${data.hours} hour${data.hours !== 1 ? 's' : ''}`,
          inline: true,
        },
        {
          name: 'Minutes Worked',
          value: `${data.minutes} minute${data.minutes !== 1 ? 's' : ''}`,
          inline: true,
        },
        {
          name: '\u200b',
          value: '\u200b',
          inline: false,
        },
        {
          name: 'Hour Rate',
          value: `$${fmt(RATE_HOUR)} / hr`,
          inline: true,
        },
        {
          name: 'Minute Rate',
          value: `$${fmt(RATE_MINUTE)} / min`,
          inline: true,
        },
        {
          name: '\u200b',
          value: '\u200b',
          inline: false,
        },
        {
          name: 'Base Pay',
          value: `$${fmt(data.basePay)}`,
          inline: true,
        },
        {
          name: 'AOTW Bonus',
          value: data.aotw
            ? `+$${fmt(AOTW_BONUS)}`
            : 'None',
          inline: true,
        },
        {
          name: '\u200b',
          value: '\u200b',
          inline: false,
        },
        {
          name: 'Final Total',
          value: `**$${fmt(data.total)}**`,
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({
        text: 'Department of Homeland Security • Payroll',
      });

    await interaction.reply({
      embeds: [receiptEmbed],
      flags: MessageFlags.Ephemeral,
    });
  },
};