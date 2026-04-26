import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
} from 'discord.js';

export const name = 'deployment';

const ALLOWED_ROLE = '1426608758133358592';
const DEPLOYMENT_CHANNEL_ID = '1400527251748946031';
const PING_ROLE_ID = '1447274909775691959';

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

function buildCustomId(hostId, cohostId, note) {
  const base = `deployment_end:${hostId}:${cohostId}:`;
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

  const hostId = message.member.id;
  const cohostId = cohost ? cohost.id : 'none';
  const cohostLine = cohost ? `<@${cohost.id}>` : 'N/A';
  const customId = buildCustomId(hostId, cohostId, note);

  const container = new ContainerBuilder()
    .setAccentColor(0x1d72d7)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## A deployment has been started`)
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
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel('End Deployment')
          .setStyle(ButtonStyle.Danger)
      )
    );

  await channel.send({
    content: `<@&${PING_ROLE_ID}>`,
    allowedMentions: { roles: [PING_ROLE_ID] },
  });

  const sent = await channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });

  message.delete().catch(() => null);

  return sent;
}
