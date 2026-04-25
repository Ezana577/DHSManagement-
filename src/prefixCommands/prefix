import {
EmbedBuilder,
ButtonBuilder,
ButtonStyle,
ActionRowBuilder,
ModalBuilder,
TextInputBuilder,
TextInputStyle,
} from 'discord.js';
import { getPrefix, setPrefix } from '../utils/prefixStore.js';
import { Style } from '../utils/style.js';

export const name = 'prefix';

const ALLOWED_ROLES = [
'1400533620610957493',
'1496312707907977387',
'1496619580188004415',
];

function hasAllowedRole(member) {
return ALLOWED_ROLES.some((id) => member.roles.cache.has(id));
}

function buildPrefixEmbed() {
const embed = new EmbedBuilder()
.setColor(Style.color)
.setTitle('Prefix Configuration')
.setDescription('Greetings. The current prefix is')
.addFields({ name: 'Bot Prefix', value: `\`\`\`${getPrefix()}\`\`\`` })
.setFooter(Style.footer('prefix'));

const row = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId('msg_prefix_change')
.setLabel('Change Prefix')
.setStyle(ButtonStyle.Primary)
);

return { embeds: [embed], components: [row] };
}

export async function execute(message) {
if (!hasAllowedRole(message.member)) {
const reply = await message.reply({ content: 'You do not have permission to use this command.' });
setTimeout(() => reply.delete().catch(() => null), 5000);
return;
}

const sent = await message.reply(buildPrefixEmbed());

setTimeout(() => {
sent.delete().catch(() => null);
}, 30000);

return sent;
}

export const buttons = {
msg_prefix_change: async (interaction, originUserId) => {
if (interaction.user.id !== originUserId) {
await interaction.reply({ content: 'Only the person who ran this command can use this button.', ephemeral: true });
return;
}

const modal = new ModalBuilder()
  .setCustomId('msg_prefix_modal')
  .setTitle('Change Prefix');

const input = new TextInputBuilder()
  .setCustomId('msg_prefix_input')
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
msg_prefix_modal: async (interaction, originUserId) => {
if (!hasAllowedRole(interaction.member)) {
await interaction.reply({ content: 'You do not have permission to change the prefix.', ephemeral: true });
return;
}

const oldPrefix = getPrefix();
const newPrefix = interaction.fields.getTextInputValue('msg_prefix_input').trim();
setPrefix(newPrefix);

const embed = new EmbedBuilder()
  .setColor(Style.color)
  .setTitle('Prefix Updated')
  .setDescription('Greetings. The prefix has been updated.')
  .addFields(
    { name: 'Previous Prefix', value: `\`\`\`${oldPrefix}\`\`\``, inline: true },
    { name: 'New Prefix', value: `\`\`\`${newPrefix}\`\`\``, inline: true }
  )
  .setFooter(Style.footer('prefix'));

await interaction.reply({ embeds: [embed] });
setTimeout(() => interaction.deleteReply().catch(() => null), 10000);
},
};