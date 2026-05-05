import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from 'discord.js';

export const name = 'training';

const ALLOWED_ROLE = '1496636002650030230';
const TRAINING_CHANNEL_ID = '1400629787554480148';

export async function execute(message, args) {
  if (message.channelId !== TRAINING_CHANNEL_ID) return;

  if (!message.member.roles.cache.has(ALLOWED_ROLE)) {
    const reply = await message.reply({ content: 'You do not have permission to use this command.' });
    setTimeout(() => reply.delete().catch(() => null), 5000);
    message.delete().catch(() => null);
    return;
  }

  const cohost = message.mentions.users.first() ?? null;
  const hostId = message.member.id;
  const cohostId = cohost ? cohost.id : null;
  const timestamp = `<t:${Math.floor(Date.now() / 1000)}:F>`;

  const infoLine = cohostId
    ? `**Host:** <@${hostId}>\n**Co Host:** <@${cohostId}>`
    : `**Host:** <@${hostId}>`;

  const container = new ContainerBuilder()
    .setAccentColor(0x1d72d7)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## DHS Academy Training`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(infoLine)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `A training is being hosted! Join now.\n**Instructions:**\n\n` +
        `• Join the Training Main, Code: SWPC\n` +
        `• You must be professional\n` +
        `• Join the DHS Police team\n` +
        `• Wear DHS Uniform polo\n` +
        `• Respect all members of the community\n` +
        `• Wait in the PD briefing room`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Will cancel in 10 minutes if no one comes or reacts to the training.`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${timestamp}**`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# DHS System | Training`)
    );

  const mentionContent = cohostId
    ? `<@${hostId}> <@${cohostId}>`
    : `<@${hostId}>`;

  message.delete().catch(() => null);

  await message.channel.send({
    content: mentionContent,
    allowedMentions: { users: cohostId ? [hostId, cohostId] : [hostId] },
  });

  const sent = await message.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });

  return sent;
}
