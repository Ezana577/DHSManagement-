import { EmbedBuilder } from ‘discord.js’;

const ALLOWED_USERS = [‘1400533620610957493’, ‘1496619580188004415’, ‘1496312707907977387’];
const LOG_CHANNEL_ID = ‘1400610140406808768’;

export const name = ‘say’;

export async function execute(message, args) {
if (!ALLOWED_USERS.includes(message.author.id)) return;

const content = args.join(’ ’);
if (!content) return;

await message.delete().catch(() => null);
const sent = await message.channel.send(content);

const logChannel = await message.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
if (!logChannel) return sent;

const embed = new EmbedBuilder()
.setTitle(‘!say Used’)
.setColor(0x5865f2)
.addFields(
{ name: ‘Executor’, value: `<@${message.author.id}> (${message.author.tag} — \`${message.author.id}`)`, inline: false }, { name: 'Channel', value: `<#${message.channel.id}> (`${message.channel.id}`)`, inline: false }, { name: 'Server', value: `${message.guild.name} (`${message.guild.id}`)`, inline: false }, { name: 'Message Sent', value: ````${content}````, inline: false }
)
.setTimestamp()
.setFooter({ text: ‘DHS Bot • Say Log’ });

await logChannel.send({ embeds: [embed] });

return sent;
}