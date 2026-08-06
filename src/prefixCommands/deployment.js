import {
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

export const name = 'deployment';

const ALLOWED_ROLE = '1426608758133358592';
const BYPASS_ROLE = '1496312707907977387';
const DEPLOYMENT_CHANNEL_ID = '1400527251748946031';
const PING_ROLE_ID = '1447274909775691959';
const PING_ROLE_ID_2 = '1519373671553040464';
const PING_ROLE_ID_3 = '1527515290420904036';
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const BANNER_URL = 'https://media.discordapp.net/attachments/1400947813365584025/1519755229611036772/image.png';
const DHS_EMOJI = '<:DHS:1520047343016087633>';

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

export const cooldowns = new Map();

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

function buildCustomId(hostId, cohostId, note, startTs) {
  const base = `deployment_end:${hostId}:${cohostId}:${startTs}:`;
  const maxNote = 100 - base.length;
  const safeNote = note.slice(0, maxNote);
  return `${base}${safeNote}`;
}

export async function execute(message, args) {
  if (!message.member.roles.cache.has(ALLOWED_ROLE)) {
    const reply = await message.reply({ content: 'You do not have permission to use this command.' });
    setTimeout(() => reply.delete().catch(() => null), 5000);
    message.delete().catch(() => null);
    return;
  }

  const hasBypass = message.member.roles.cache.has(BYPASS_ROLE);
  const userId = message.member.id;
  const now = Date.now();

  if (!hasBypass) {
    const cd = cooldowns.get(userId);
    if (cd && now < cd) {
      const remainingTs = Math.floor(cd / 1000);
      const reply = await message.reply({
        content: `You may not host a deployment for <t:${remainingTs}:R>.`,
      });
      setTimeout(() => reply.delete().catch(() => null), 8000);
      message.delete().catch(() => null);
      return;
    }
  }

  const cohost = message.mentions.users.first() ?? null;
  const noteArgs = args.filter((a) => !a.startsWith('<@'));
  const note = noteArgs.join(' ').trim().slice(0, 40);

  if (!note) {
    const reply = await message.reply({
      content: `You are required to set a note.\n\nExample: \`!deployment @user Deploy to sector 4\``,
    });
    setTimeout(() => reply.delete().catch(() => null), 8000);
    message.delete().catch(() => null);
    return;
  }

  const channel = message.guild.channels.cache.get(DEPLOYMENT_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    const reply = await message.reply({ content: 'Deployment channel not found or is not a text channel.' });
    setTimeout(() => reply.delete().catch(() => null), 5000);
    return;
  }

  const hostId = userId;
  const cohostId = cohost ? cohost.id : 'none';
  const cohostLine = cohost ? `<@${cohost.id}>` : 'N/A';
  const startTs = Math.floor(now / 1000);
  const customId = buildCustomId(hostId, cohostId, note, startTs);

  const container = new ContainerBuilder()
    .setAccentColor(0x1d72d7)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${DHS_EMOJI} Deployment`)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`<@&${PING_ROLE_ID}> <@&${PING_ROLE_ID_2}> <@&${PING_ROLE_ID_3}>`)
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
    )
    .addActionRowComponents(
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
    allowedMentions: { roles: [PING_ROLE_ID, PING_ROLE_ID_2, PING_ROLE_ID_3] },
  });

  await sent.react('✅');

  message.delete().catch(() => null);

  return sent;
}