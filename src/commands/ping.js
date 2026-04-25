import {
SlashCommandBuilder,
EmbedBuilder,
ButtonBuilder,
ButtonStyle,
ActionRowBuilder,
ModalBuilder,
TextInputBuilder,
TextInputStyle,
} from 'discord.js';
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
.setDescription('View and change the bot prefix.');

export async function execute(interaction) {
if (!hasAllowedRole(interaction.member)) {
await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
return;
}

const embed = new EmbedBuilder()
.setColor(Style.color)
.setTitle('Prefix Configuration')
.setDescription('Greetings. The current prefix is')
.addFields({ name: 'Bot Prefix', value: `\`\`\`${getPrefix()}\`\`\`` })
.setFooter(Style.footer('/prefix'));

const row = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId(`prefix_change:${interaction.user.id}`)
.setLabel('Change Prefix')
.setStyle(ButtonStyle.Primary)
);

await interaction.reply({ embeds: [embed], components: [row] });

setTimeout(() => {
interaction.deleteReply().catch(() => null);
}, 30000);
}

export const buttons = {
prefix_change: async (interaction) => {
const [, ownerId] = interaction.customId.split(':');

if (interaction.user.id !== ownerId) {
  await interaction.reply({ content: 'Only the person who ran this command can use this button.', ephemeral: true });
  return;
}

const modal = new ModalBuilder()
  .setCustomId(`prefix_modal:${ownerId}`)
  .setTitle('Change Prefix');

const input = new TextInputBuilder()
  .setCustomId('prefix_input')
  .setLabel('New Prefix')
  .setStyle(TextInputStyle.Short)
  .setMinLength(1)
  .setMaxLength(5)
  .setPlaceholder('Enter a new prefix')
  .setRequired(true);

modal.addComponents(new ActionRowBuilder().addComponents(input));
await interaction.showModal(modal);
},
};

export const modals = {
prefix_modal: async (interaction) => {
if (!hasAllowedRole(interaction.member)) {
await interaction.reply({ content: 'You do not have permission to change the prefix.', ephemeral: true });
return;
}

const oldPrefix = getPrefix();
const newPrefix = interaction.fields.getTextInputValue('prefix_input').trim();
setPrefix(newPrefix);

const embed = new EmbedBuilder()
  .setColor(Style.color)
  .setTitle('Prefix Updated')
  .setDescription('Greetings. The prefix has been updated.')
  .addFields(
    { name: 'Previous Prefix', value: `\`\`\`${oldPrefix}\`\`\``, inline: true },
    { name: 'New Prefix', value: `\`\`\`${newPrefix}\`\`\``, inline: true }
  )
  .setFooter(Style.footer('/prefix'));

await interaction.reply({ embeds: [embed] });

setTimeout(() => {
  interaction.deleteReply().catch(() => null);
}, 10000);
},
};