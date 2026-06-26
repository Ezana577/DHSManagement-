import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';

const ALLOWED_ROLE = '1426608758133358592';
const BYPASS_ROLE = '1496312707907977387';
const DEPLOYMENT_CHANNEL_ID = '1441817740791910551';
const LOG_CHANNEL_ID = '1441817740791910551';
const PING_ROLE_ID = '1447274909775691959';
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const BANNER_URL = 'https://media.discordapp.net/attachments/1400947813365584025/1519755229611036772/image.png';
const DHS_EMOJI = '<:DHS:1498034960639197335>';

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

const cooldowns = new Map();

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function buildActiveContainer(hostId, cohostId, note, startTs) {
  const cohostLine = cohostId !== 'none' ? `<@${cohostId}>` : 'N/A';
  return new ContainerBuilder()
    .setAccentColor(0x1d72d7)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${DHS_EMOJI} Deployment`)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`<@&${PING_ROLE_ID}>`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Host**\n<@${hostId}>\n\n**Co-Host**\n${cohostLine}\n\n**Status**\nActive`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Notes**\n${note}\n\n**Started**\n<t:${startTs}:F>`
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
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(BANNER_URL)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# DHS System | Deployment`)
    );
}

function buildEndedContainer(hostId, cohostId, note, startTs, endTs, attendees) {
  const cohostLine = cohostId !== 'none' ? `<@${cohostId}>` : 'N/A';
  const durationMs = (endTs - startTs) * 1000;
  const duration = formatDuration(durationMs);

  return new ContainerBuilder()
    .setAccentColor(0xff0000)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${DHS_EMOJI} Deployment`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Host**\n<@${hostId}>\n\n**Co-Host**\n${cohostLine}\n\n**Status**\nEnded`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Notes**\n${note}\n\n**Started**\n<t:${startTs}:F>\n\n**Ended**\n<t:${endTs}:F>`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Deployment Statistics**\n• Duration: ${duration}\n• Attendees: ${attendees}\n• Status: Completed`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(BANNER_URL)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# DHS System | Deployment`)
    );
}

function buildCustomId(hostId, cohostId, note, startTs) {
  const base = `deployment_end:${hostId}:${cohostId}:${startTs}:`;
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

  const hasBypass = interaction.member.roles.cache.has(BYPASS_ROLE);
  const userId = interaction.member.id;
  const now = Date.now();

  if (!hasBypass) {
    const cd = cooldowns.get(userId);
    if (cd && now < cd) {
      const remainingTs = Math.floor(cd / 1000);
      await interaction.reply({
        content: `You may not host a deployment for <t:${remainingTs}:R>.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const note = interaction.options.getString('note');
  const cohost = interaction.options.getUser('cohost');
  const hostId = userId;
  const cohostId = cohost ? cohost.id : 'none';

  const channel = interaction.guild.channels.cache.get(DEPLOYMENT_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({ content: 'Deployment channel not found or is not a text channel.', flags: MessageFlags.Ephemeral });
    return;
  }

  const startTs = Math.floor(now / 1000);
  const customId = buildCustomId(hostId, cohostId, note, startTs);
  const container = buildActiveContainer(hostId, cohostId, note, startTs);

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(customId)
        .setLabel('End Deployment')
        .setStyle(ButtonStyle.Danger)
    )
  );

  const sent = await channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { roles: [PING_ROLE_ID] },
  });

  await sent.react('✅');

  await interaction.reply({ content: `Deployment started in ${channel}.`, flags: MessageFlags.Ephemeral });
}

export const buttons = {
  deployment_end: async (interaction) => {
    const parts = interaction.customId.split(':');
    const hostId = parts[1];
    const cohostId = parts[2];
    const startTs = parseInt(parts[3], 10);
    const note = parts.slice(4).join(':');

    const isEnded = interaction.message.components?.[0]?.components?.some(
      (c) => c.type === 10 && c.content?.includes('Status**\nEnded')
    );

    if (isEnded) {
      await interaction.reply({ content: 'This deployment has already ended.', flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.member;
    const hasRole = END_ALLOWED_ROLES.some((id) => member.roles.cache.has(id));
    const isHost = member.id === hostId;
    const isCohost = cohostId !== 'none' && member.id === cohostId;

    if (!isHost && !isCohost && !hasRole) {
      await interaction.reply({ content: 'You do not have proper permission to end this deployment.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferUpdate();

    const endTs = Math.floor(Date.now() / 1000);

    cooldowns.set(hostId, Date.now() + COOLDOWN_MS);
    if (cohostId !== 'none') cooldowns.set(cohostId, Date.now() + COOLDOWN_MS);

    const message = interaction.message;
    let attendees = 0;
    const attendeeIds = [];
    try {
      const reaction = message.reactions.cache.get('✅');
      if (reaction) {
        const users = await reaction.users.fetch();
        const nonBots = users.filter((u) => !u.bot);
        attendees = nonBots.size;
        nonBots.forEach((u) => attendeeIds.push(u.id));
      }
    } catch {}

    const messageLink = `https://discord.com/channels/${interaction.guild.id}/${message.channel.id}/${message.id}`;
    const attendeeCustomId = `deployment_attendees:${attendeeIds.join(',')}`;

    const endedContainer = buildEndedContainer(hostId, cohostId, note, startTs, endTs, attendees);

    endedContainer.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('deployment_ended_disabled')
          .setLabel('Deployment Ended')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(attendeeCustomId)
          .setLabel('View Attendees')
          .setStyle(ButtonStyle.Secondary)
      )
    );

    await interaction.editReply({
      components: [endedContainer],
      flags: MessageFlags.IsComponentsV2,
    });

    const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      const durationMs = (endTs - startTs) * 1000;
      const duration = formatDuration(durationMs);
      const cohostLine = cohostId !== 'none' ? `<@${cohostId}>` : 'N/A';

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
            `**Host:** <@${hostId}>\n**Co-Host:** ${cohostLine}\n**Note:** ${note}\n**Started:** <t:${startTs}:F>\n**Ended:** <t:${endTs}:F>\n**Duration:** ${duration}\n**Attendees:** ${attendees}\n**Deployment Link:** ${messageLink}`
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

  deployment_attendees: async (interaction) => {
    const idsPart = interaction.customId.slice('deployment_attendees:'.length);
    const ids = idsPart ? idsPart.split(',').filter(Boolean) : [];

    if (ids.length === 0) {
      await interaction.reply({ content: 'No attendees were logged for this deployment.', flags: MessageFlags.Ephemeral });
      return;
    }

    const list = ids.map((id, i) => `${i + 1}. <@${id}>`).join('\n');
    await interaction.reply({
      content: `**Attendees (${ids.length})**\n${list}`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};
