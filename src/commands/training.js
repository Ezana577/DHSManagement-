import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from 'discord.js';

const ALLOWED_ROLE = '1496636002650030230';
const TRAINING_CHANNEL_ID = '1400629787554480148';
const PING_ROLE_ID = '1400529105128001677';

export const data = new SlashCommandBuilder()
  .setName('training')
  .setDescription('Host a training session.')
  .addUserOption((option) =>
    option.setName('cohost').setDescription('Co Host for the training.').setRequired(false)
  );

export async function execute(interaction) {
  if (interaction.channelId !== TRAINING_CHANNEL_ID) return;

  if (!interaction.member.roles.cache.has(ALLOWED_ROLE)) {
    await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
    return;
  }

  const cohost = interaction.options.getUser('cohost');
  const hostId = interaction.member.id;
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
        `• Join the Training Server, Code: SWPC\n` +
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

  await interaction.reply({ content: 'Training posted.', flags: MessageFlags.Ephemeral });

  await interaction.channel.send({
    content: `<@&${PING_ROLE_ID}>`,
    allowedMentions: { roles: [PING_ROLE_ID] },
  });

  await interaction.channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}
