import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  ChannelType,
} from 'discord.js';

const ALLOWED_ROLE = '1426608758133358592';
const DEPLOYMENT_CHANNEL_ID = '1400527251748946031';
const LOG_CHANNEL_ID = '1441817740791910551';

const END_ALLOWED_ROLES = [
  '1400533620610957493',
  '1400534135143141577',
  '1496619580188004415',
  '1496312707907977387',
];

const REQUIREMENTS = [
  '• Maintain professionalism at all times',
  '• Full DHS uniform required',
  '• Respect all members of the community',
  '• Follow all server and department rules',
  '• Be active and responsive during the deployment',
  '• Join the Main Server (PRPCS.)',
].join('\n');

const IMPORTANT = [
  'Make sure your shift is active before joining.',
  'Operate professionally at all times.',
].join('\n');

function buildContainer(accentColor, statusLine, hostId, cohostId, note) {
  const cohostLine = cohostId !== 'none' ? `<@${cohostId}>` : 'N/A';

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${statusLine}`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Host:** <@${hostId}>\n**Co Host:** ${cohostLine}\n**Notes:** ${note}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Requirements:**\n${REQUIREMENTS}`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Important:**\n${IMPORTANT}`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# DHS System | Deployment`)
    );
}
function buildCustomId(hostId, cohostId, note) {
  const base = `deployment_end:${hostId}:${cohostId}:`;
  const maxNote = 100 - base.length;
  const safeNote = note.slice(0, maxNote);
  return `${base}${safeNote}`;
}

export const data = new SlashCommandBuilder()
  .setName('deployment')
  .setDescription('Start a deployment.')
  .addStringOption((option) =>
    option.setName('note').setDescription('Deployment note. Max 40 characters.').setRequired(true).setMaxLength(40)
  )
  .addUserOption((option) =>
    option.setName('cohost').setDescription('Choose a Co Host to lead with during the deployment.').setRequired(false)
  );

export async function execute(interaction) {
  if (!interaction.member.roles.cache.has(ALLOWED_ROLE)) {
    await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    return;
  }

  const note = interaction.options.getString('note');
  const cohost = interaction.options.getUser('cohost');
  const hostId = interaction.member.id;
  const cohostId = cohost ? cohost.id : 'none';

  const channel = interaction.guild.channels.cache.get(DEPLOYMENT_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({ content: 'Deployment channel not found or is not a text channel.', flags: MessageFlags.Ephemeral });
    return;
  }

  const customId = buildCustomId(hostId, cohostId, note);
  const container = buildContainer(0x1d72d7, 'A deployment has been started', hostId, cohostId, note);

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel('End Deployment')
        .setStyle(ButtonStyle.Danger)
    )
  );

  await channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });

  await interaction.reply({ content: `Deployment started in ${channel}.`, flags: MessageFlags.Ephemeral });
}

export const buttons = {
  deployment_end: async (interaction) => {
    const ended = interaction.message.components?.[0]?.components?.some(
      (c) => c.type === 10 && c.content === 'The deployment has ended'
    );

    if (ended) {
      await interaction.reply({ content: 'This deployment has already ended.', flags: MessageFlags.Ephemeral });
      return;
    }

    const parts = interaction.customId.split(':');
    const hostId = parts[1];
    const cohostId = parts[2];
    const note = parts.slice(3).join(':');

    const member = interaction.member;
    const hasRole = END_ALLOWED_ROLES.some((id) => member.roles.cache.has(id));
    const isHost = member.id === hostId;
    const isCohost = cohostId !== 'none' && member.id === cohostId;

    if (!isHost && !isCohost && !hasRole) {
      await interaction.reply({ content: 'You do not have proper permission to end this deployment.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferUpdate();

    const endedContainer = buildContainer(0xff0000, 'The deployment has ended', hostId, cohostId, note);

    await interaction.editReply({
      components: [endedContainer],
      flags: MessageFlags.IsComponentsV2,
    });

    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      const timestamp = `<t:${Math.floor(Date.now() / 1000)}:F>`;
      const cohostLine = cohostId !== 'none' ? `<@${cohostId}>` : null;

      const logContainer = new ContainerBuilder()
        .setAccentColor(0xff0000)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Deployment Ended**`)
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**Host:** <@${hostId}>\n` +
            (cohostLine ? `**Co Host:** ${cohostLine}\n` : '') +
            `**Note:** ${note}\n` +
            `**Timestamp:** ${timestamp}`
          )
        )
        .addSeparatorComponents(
          new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# DHS System | Deployment`)
        );

      await logChannel.send({
        components: [logContainer],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }
  },
};
