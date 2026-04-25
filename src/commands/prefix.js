import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { setPrefix, getPrefix } from '../utils/prefixStore.js';
import { Style } from '../utils/style.js';

const ALLOWED_ROLES = [
'1400533620610957493',
'1496312707907977387',
'1496619580188004415',
];

function hasAllowedRole(member) {
return ALLOWED_ROLES.some((id) => member.roles.cache.has(id));
}

export const data = new SlashCommandBuilder()
.setName('prefix')
.setDescription('Change the bot prefix.')
.addStringOption((option) =>
option.setName('new_prefix').setDescription('The new prefix to set.').setRequired(true)
);

export async function execute(interaction) {
if (!hasAllowedRole(interaction.member)) {
await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
return;
}

const newPrefix = interaction.options.getString('new_prefix');
const oldPrefix = getPrefix();
setPrefix(newPrefix);

const embed = new EmbedBuilder()
.setColor(Style.color)
.setTitle('Prefix Updated')
.addFields(
{ name: 'Previous Prefix', value: `\`${oldPrefix}\``, inline: true },
{ name: 'New Prefix', value: `\`${newPrefix}\``, inline: true }
)
.setFooter(Style.footer('/prefix'));

await interaction.reply({ embeds: [embed] });

setTimeout(() => {
interaction.deleteReply().catch(() => null);
}, 10000);
}