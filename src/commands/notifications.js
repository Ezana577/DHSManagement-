import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from 'discord.js';

const ALLOWED_ROLE = '1496312707907977387';

const PING_ROLES = [
  {
    id: '1401245512652292218',
    label: 'QOTD Ping',
    description: 'Get notified when a new Question of the Day is posted.',
    customId: 'notif_qotd',
  },
  {
    id: '1497682789301092493',
    label: 'Server Updates',
    description: 'Stay informed on server changes, rule updates, and announcements.',
    customId: 'notif_updates',
  },
  {
    id: '1401245573113184258',
    label: 'DHS Media',
    description: 'Receive pings for photos, videos, and media drops.',
    customId: 'notif_media',
  },
  {
    id: '1401245430892990525',
    label: 'Minor Announcements',
    description: 'Low priority pings for smaller updates and reminders.',
    customId: 'notif_minor',
  },
];

export const data = new SlashCommandBuilder()
  .setName('notifications')
  .setDescription('Post the notification role selector.')
  .addChannelOption((option) =>
    option.setName('channel').setDescription('Channel to send the embed in.').setRequired(true)
  );

export async function execute(interaction) {
  if (!interaction.member.roles.cache.has(ALLOWED_ROLE)) {
    await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = interaction.options.getChannel('channel');

  const container = new ContainerBuilder()
    .setAccentColor(0x1d72d7)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## DHS Notification Preferences')
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Select which notifications you want to receive. Click again to remove.\n\n' +
        PING_ROLES.map((r) => `<@&${r.id}>\n-# ${r.description}`).join('\n\n')
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# DHS System | Self Roles')
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        PING_ROLES.map((r) =>
          new ButtonBuilder()
            .setCustomId(r.customId)
            .setLabel(r.label)
            .setStyle(ButtonStyle.Secondary)
        )
      )
    );

  await channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [] },
  });

  await interaction.reply({ content: `Notification panel sent to ${channel}.`, flags: MessageFlags.Ephemeral });
}

export const buttons = {
  notif_qotd: (interaction) => handleToggle(interaction, '1401245512652292218', 'QOTD Ping'),
  notif_updates: (interaction) => handleToggle(interaction, '1497682789301092493', 'Server Updates'),
  notif_media: (interaction) => handleToggle(interaction, '1401245573113184258', 'DHS Media'),
  notif_minor: (interaction) => handleToggle(interaction, '1401245430892990525', 'Minor Announcements'),
};

async function handleToggle(interaction, roleId, roleName) {
  const member = interaction.member;
  const hasRole = member.roles.cache.has(roleId);

  if (hasRole) {
    await member.roles.remove(roleId);
    await interaction.reply({ content: `Removed **${roleName}**.`, flags: MessageFlags.Ephemeral });
  } else {
    await member.roles.add(roleId);
    await interaction.reply({ content: `Added **${roleName}**.`, flags: MessageFlags.Ephemeral });
  }
}
