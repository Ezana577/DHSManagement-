import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { Style } from '../utils/style.js';
import { isOnCooldown } from '../utils/cooldown.js';

function buildEmbed(client, latency) {
const embed = new EmbedBuilder()
.setColor(Style.color)
.setTitle('Network Status')
.addFields(
{ name: 'Websocket Latency', value: `${client.ws.ping}ms`, inline: true },
{ name: 'Roundtrip Latency', value: `${latency}ms`, inline: true },
{ name: 'API Status', value: 'Operational', inline: true }
)
.setFooter(Style.footer('/ping'));

const row = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId('ping_refresh')
.setLabel('Refresh')
.setStyle(ButtonStyle.Primary)
);

return { embeds: [embed], components: [row] };
}

export const data = new SlashCommandBuilder()
.setName('ping')
.setDescription('Displays current latency and network status.');

export async function execute(interaction) {
const remaining = isOnCooldown(interaction.user.id, 'ping', 10000);

if (remaining) {
await interaction.reply({
content: `This command is on cooldown. Please wait **${remaining}s**.`,
ephemeral: true,
});
return;
}

const sent = await interaction.reply({ content: 'Measuring...', fetchReply: true });
const latency = sent.createdTimestamp - interaction.createdTimestamp;

await interaction.editReply(buildEmbed(interaction.client, latency));

setTimeout(() => {
interaction.deleteReply().catch(() => null);
}, 10000);
}

export const buttons = {
ping_refresh: async (interaction) => {
const remaining = isOnCooldown(interaction.user.id, 'ping_refresh', 5000);

if (remaining) {
  await interaction.reply({
    content: `Please wait **${remaining}s** before refreshing again.`,
    ephemeral: true,
  });
  return;
}

await interaction.deferUpdate();
const latency = Date.now() - interaction.createdTimestamp;
await interaction.editReply(buildEmbed(interaction.client, latency));
},
};