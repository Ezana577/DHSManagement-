import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

const ALLOWED_ROLES = ['1400533620610957493', '1496619580188004415', '1496312707907977387'];
const LOG_CHANNEL_ID = '1400610140406808768';

export const data = new SlashCommandBuilder()
  .setName('say')
  .setDescription('Send a message as the bot.')
  .addStringOption((option) =>
    option.setName('message').setDescription('The message to send.').setRequired(true)
  );

export async function execute(interaction) {
  const member = interaction.member;
  const hasRole = ALLOWED_ROLES.some((id) => member.roles.cache.has(id));

  if (!hasRole) {
    return interaction.reply({ content: 'You are not authorized to use this command.', flags: MessageFlags.Ephemeral });
  }

  const message = interaction.options.getString('message');

  await interaction.reply({ content: '\u200b', flags: MessageFlags.Ephemeral });
  await interaction.deleteReply();
  await interaction.channel.send(message);

  const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle('/say Used')
    .setColor(0x5865f2)
    .addFields(
      { name: 'Executor', value: `<@${interaction.user.id}> (${interaction.user.tag} — \`${interaction.user.id}\`)`, inline: false },
      { name: 'Channel', value: `<#${interaction.channel.id}> (\`${interaction.channel.id}\`)`, inline: false },
      { name: 'Server', value: `${interaction.guild.name} (\`${interaction.guild.id}\`)`, inline: false },
      { name: 'Message Sent', value: `\`\`\`${message}\`\`\``, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'DHS Bot • Say Log' });

  await logChannel.send({ embeds: [embed] });
}