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
import {
  HISTORY_PAGE_SIZE,
  nextDeploymentId,
  insertDeployment,
  updateDeploymentByMessageId,
  getDeploymentsForUser,
  getDeploymentHistoryPage,
  computeDeploymentStats,
} from '../utils/deploymentHelpers.js';

const ALLOWED_ROLE = '1426608758133358592';
const BYPASS_ROLE = '1496312707907977387';
const DEPLOYMENT_CHANNEL_ID = '1400527251748946031';
const LOG_CHANNEL_ID = '1441817740791910551';
const PING_ROLE_ID = '1447274909775691959';
const PING_ROLE_ID_2 = '1519373671553040464';
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const BANNER_URL = 'https://media.discordapp.net/attachments/1400947813365584025/1519755229611036772/image.png';
const DHS_EMOJI = '<:DHS:1520047343016087633>';

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

// ── Formatting helpers ──────────────────────────────────────────────────────

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

function formatDurationSeconds(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0 && m === 0) return '0m';
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ');
}

// ── Live deployment containers (unchanged visuals, now DB-backed) ──────────

function buildActiveContainer(hostId, cohostId, note, startTs) {
  const cohostLine = cohostId !== 'none' ? `<@${cohostId}>` : 'N/A';
  return new ContainerBuilder()
    .setAccentColor(0x1d72d7)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${DHS_EMOJI} Deployment`)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`<@&${PING_ROLE_ID}> <@&${PING_ROLE_ID_2}>`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Host:** <@${hostId}>\n**Co-Host:** ${cohostLine}\n**Status:** Active`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Notes:** ${note}\n**Started:** <t:${startTs}:F>`
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
        `**Host:** <@${hostId}>\n**Co-Host:** ${cohostLine}\n**Status:** Ended`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Notes:** ${note}\n**Started:** <t:${startTs}:F>\n**Ended:** <t:${endTs}:F>`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Duration:** ${duration}\n**Attendees:** ${attendees}\n**Status:** Completed`
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

// ── Profile (status) container ──────────────────────────────────────────────

function buildStatusContainer(targetId, stats) {
  const activeSection = stats.active
    ? `**Deployment ID:** ${stats.active.deployment_id}\n` +
      `**Started:** <t:${Math.floor(new Date(stats.active.start_time).getTime() / 1000)}:R>\n` +
      `**Link:** [Jump to Deployment](${stats.active.message_link})`
    : 'Not currently deployed.';

  const container = new ContainerBuilder()
    .setAccentColor(0x1d72d7)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Deployment Profile')
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**User:** <@${targetId}>\n` +
        `**Total Deployments:** ${stats.total}\n` +
        `**Hosted:** ${stats.hosted}\n` +
        `**Co-Hosted:** ${stats.cohosted}\n` +
        `**Attended:** ${stats.attended}\n` +
        `**Total Deployment Time:** ${formatDurationSeconds(stats.totalSeconds)}\n` +
        `**Average Deployment Length:** ${formatDurationSeconds(stats.avgSeconds)}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Current Deployment**\n${activeSection}`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

  const recent = stats.recent ?? [];
  if (recent.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('**Recent History**\nNo deployments recorded yet.')
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('**Recent History**')
    );
    for (const row of recent) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(formatHistoryLine(row))
      );
    }
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# DHS System | Deployment Profile')
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`deployment_history_open:${targetId}`)
          .setLabel('View Full History')
          .setStyle(ButtonStyle.Secondary)
      )
    );

  return container;
}

function formatHistoryLine(row) {
  const dateTs = Math.floor(new Date(row.start_time).getTime() / 1000);
  const durationText = typeof row.duration === 'number' ? formatDurationSeconds(row.duration) : 'In Progress';
  const note = row.note ?? 'No note';
  const link = row.message_link ? `[Jump](${row.message_link})` : 'No link';
  return (
    `**${row.deployment_id}** — ${note}\n` +
    `Duration: ${durationText} | Date: <t:${dateTs}:d> | ${link}`
  );
}

// ── History (paginated) container ───────────────────────────────────────────

async function buildHistoryContainer(guildId, targetId, page) {
  const { rows, total } = await getDeploymentHistoryPage(guildId, targetId, page);
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const container = new ContainerBuilder()
    .setAccentColor(0x1d72d7)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Deployment History')
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**User:** <@${targetId}>\n**Total Records:** ${total}\n**Page:** ${safePage + 1} / ${totalPages}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

  if (rows.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('No deployments recorded for this user.')
    );
  } else {
    for (const row of rows) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(formatHistoryLine(row))
      );
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );
    }
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# DHS System | Deployment History')
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`deployment_history_page:${targetId}:${safePage - 1}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`deployment_history_page:${targetId}:${safePage + 1}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1)
    )
  );

  return container;
}

// ── Slash command definition ────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('deployment')
  .setDescription('Deployment tools.')
  .addSubcommand((sub) =>
    sub
      .setName('start')
      .setDescription('Start a deployment.')
      .addStringOption((option) =>
        option.setName('note').setDescription('Deployment note. Max 40 characters.').setRequired(true).setMaxLength(40)
      )
      .addUserOption((option) =>
        option.setName('cohost').setDescription('Choose a Co Host to lead with during the deployment.').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('status')
      .setDescription("View a user's deployment profile.")
      .addUserOption((option) =>
        option.setName('user').setDescription('The user to look up. Defaults to you.').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('history')
      .setDescription("View a user's full deployment history.")
      .addUserOption((option) =>
        option.setName('user').setDescription('The user to look up. Defaults to you.').setRequired(false)
      )
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'start') return executeStart(interaction);
  if (sub === 'status') return executeStatus(interaction);
  if (sub === 'history') return executeHistory(interaction);
}

// ── /deployment start ───────────────────────────────────────────────────────

async function executeStart(interaction) {
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
    allowedMentions: { roles: [PING_ROLE_ID, PING_ROLE_ID_2] },
  });

  await sent.react('✅');

  const messageLink = `https://discord.com/channels/${interaction.guild.id}/${channel.id}/${sent.id}`;

  try {
    const deploymentId = await nextDeploymentId(interaction.guild.id);
    await insertDeployment({
      deployment_id: deploymentId,
      guild_id: interaction.guild.id,
      host_id: hostId,
      cohost_id: cohostId !== 'none' ? cohostId : null,
      note,
      start_time: new Date(startTs * 1000).toISOString(),
      message_id: sent.id,
      message_link: messageLink,
      status: 'Active',
      attendees: [],
    });
  } catch (err) {
    console.error('[DHS Deployment] Failed to save deployment to Supabase:', err);
  }

  await interaction.reply({ content: `Deployment started in ${channel}.`, flags: MessageFlags.Ephemeral });
}

// ── /deployment status ──────────────────────────────────────────────────────

async function executeStatus(interaction) {
  await interaction.deferReply();

  const target = interaction.options.getUser('user') ?? interaction.user;

  try {
    const rows = await getDeploymentsForUser(interaction.guild.id, target.id);
    const stats = computeDeploymentStats(rows, target.id);
    stats.recent = rows.slice(0, 5);

    const container = buildStatusContainer(target.id, stats);
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch (err) {
    console.error('[DHS Deployment] Failed to load deployment status:', err);
    await interaction.editReply({ content: 'Failed to load deployment status. Please try again.' });
  }
}

// ── /deployment history ─────────────────────────────────────────────────────

async function executeHistory(interaction) {
  await interaction.deferReply();

  const target = interaction.options.getUser('user') ?? interaction.user;

  try {
    const container = await buildHistoryContainer(interaction.guild.id, target.id, 0);
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch (err) {
    console.error('[DHS Deployment] Failed to load deployment history:', err);
    await interaction.editReply({ content: 'Failed to load deployment history. Please try again.' });
  }
}

// ── Buttons ──────────────────────────────────────────────────────────────────

export const buttons = {
  deployment_end: async (interaction) => {
    const parts = interaction.customId.split(':');
    const hostId = parts[1];
    const cohostId = parts[2];
    const startTs = parseInt(parts[3], 10);
    const note = parts.slice(4).join(':');

    const isEnded = interaction.message.components?.[0]?.components?.some(
      (c) => c.type === 10 && c.content?.includes('Status:** Ended')
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
          .setDisabled(true)
      )
    );

    await interaction.editReply({
      components: [endedContainer],
      flags: MessageFlags.IsComponentsV2,
    });

    try {
      await updateDeploymentByMessageId(message.id, {
        end_time: new Date(endTs * 1000).toISOString(),
        duration: endTs - startTs,
        attendees: attendeeIds,
        status: 'Completed',
      });
    } catch (err) {
      console.error('[DHS Deployment] Failed to update deployment in Supabase:', err);
    }

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
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(attendeeCustomId)
              .setLabel('View Attendees')
              .setStyle(ButtonStyle.Secondary)
          )
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

  deployment_history_open: async (interaction) => {
    const targetId = interaction.customId.split(':')[1];
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const container = await buildHistoryContainer(interaction.guild.id, targetId, 0);
      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
      console.error('[DHS Deployment] Failed to open deployment history:', err);
      await interaction.editReply({ content: 'Failed to load deployment history. Please try again.' });
    }
  },

  deployment_history_page: async (interaction) => {
    const parts = interaction.customId.split(':');
    const targetId = parts[1];
    const page = Math.max(0, parseInt(parts[2], 10) || 0);

    await interaction.deferUpdate();

    try {
      const container = await buildHistoryContainer(interaction.guild.id, targetId, page);
      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
      console.error('[DHS Deployment] Failed to paginate deployment history:', err);
    }
  },
};
