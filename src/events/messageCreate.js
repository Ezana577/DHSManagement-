import { EmbedBuilder } from 'discord.js';
import { getPrefix } from '../utils/prefixStore.js';
import { Style } from '../utils/style.js';

export const name = 'messageCreate';
export const once = false;

export async function execute(message, prefixCommands) {
if (message.author.bot) return;

const prefix = getPrefix();

if (message.content.startsWith(prefix)) {
const args = message.content.slice(prefix.length).trim().split(/\s+/);
const commandName = args.shift().toLowerCase();
const command = prefixCommands.get(commandName);

if (command) {
  await command.execute(message, args);
  return;
}
}

const isMentioned =
message.mentions.has(message.client.user) &&
!message.mentions.everyone;

if (!isMentioned) return;

const embed = new EmbedBuilder()
.setColor(Style.color)
.setTitle('Department of Homeland Security')
.setDescription(
`Greetings. I am DHS Management. My prefix is \`\`\`${getPrefix()}\`\`\`\nFor a full list of commands, use the slash command menu.`
)
.setFooter(Style.timestamp());

const reply = await message.reply({ embeds: [embed] });

setTimeout(() => {
reply.delete().catch(() => null);
}, 10000);
}