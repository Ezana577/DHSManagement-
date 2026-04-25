import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { Style } from '../utils/style.js';
import { isOnCooldown } from '../utils/cooldown.js';

export const name = 'ping';

function buildEmbed(client, latency) {
const embed = new EmbedBuilder()
.setColor(Style.color)
.setTitle('Network Status')
.addFields(
{ name: 'Websocket Latency', value: `${client.ws.ping}ms`, inline: true },
{ name: 'Roundtrip Latency', value: `${latency}ms`, inline: true },
{ name: 'API Status', value: 'Operational', inline: true }
)
.setFooter(Style.footer('ping'));

const row = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId('prefix_ping_refresh')
.setLabel('Refresh')
.setStyle(ButtonStyle.Primary)
);

return { embeds: [embed], components: [row] };
}

export async function execute(message) {
const remaining = isOnCooldown(message.author.id, 'prefix_ping', 10000);

if (remaining) {
const reply = await message.reply({ content: `This command is on cooldown. Please wait **${remaining}s**.` });
setTimeout(() => reply.delete().catch(() => null), 5000);
return;
}

const sent = await message.reply({ content: 'Measuring...' });
const latency = sent.createdTimestamp - message.createdTimestamp;

await sent.edit(buildEmbed(message.client, latency));

setTimeout(() => {
sent.delete().catch(() => null);
}, 10000);

return sent;
}

export const buttons = {
prefix_ping_refresh: async (interaction, originUserId) => {
if (interaction.user.id !== originUserId) {
await interaction.reply({ content: 'Only the person who ran this command can use this button.', ephemeral: true });
return;
}

const remaining = isOnCooldown(interaction.user.id, 'prefix_ping_refresh', 5000);

if (remaining) {
  await interaction.reply({ content: `Please wait **${remaining}s** before refreshing again.`, ephemeral: true });
  return;
}

await interaction.deferUpdate();
const latency = Date.now() - interaction.createdTimestamp;
await interaction.editReply(buildEmbed(interaction.client, latency));
},
};