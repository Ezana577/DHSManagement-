import { EmbedBuilder } from 'discord.js';
import { getPrefix } from '../utils/prefixStore.js';
import { Style } from '../utils/style.js';

export const name = 'messageCreate';
export const once = false;

export async function execute(message, prefixCommands) {
  console.log('[EVENT] messageCreate triggered for:', message.author?.tag);

  if (message.author.bot) return;

  const prefix = getPrefix();
  console.log(`[DEBUG] prefix = "${prefix}" (length ${prefix.length})`);
  console.log(`[DEBUG] message.content = "${message.content}"`);
  console.log(`[DEBUG] Starts with prefix? ${message.content.startsWith(prefix)}`);

  if (!message.content.startsWith(prefix)) {
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

    return;
  }

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();

  console.log(`[CMD] ${message.author.tag} used: ${prefix}${commandName}`);
  console.log('[CMD] prefixCommands size:', prefixCommands?.size ?? 0);
  console.log('[CMD] Available commands:', [...(prefixCommands?.keys() ?? [])]);

  const command = prefixCommands.get(commandName);
  if (command) {
    try {
      await command.execute(message, args);
    } catch (err) {
      console.error(`[ERROR] Command "${commandName}" failed:`, err);
    }
  } else {
    console.log(`[CMD] "${commandName}" not found in prefixCommands.`);
  }
}