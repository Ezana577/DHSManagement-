import { EmbedBuilder } from 'discord.js';
import { getPrefix } from '../utils/prefixStore.js';
import { Style } from '../utils/style.js';

export const name = 'messageCreate';
export const once = false;

export async function execute(message, prefixCommands) {
  if (message.author.bot) return;

  const prefix = getPrefix();

  // Debug: Show what we received
  console.log('Message:', message.content);
  console.log('Prefix:', JSON.stringify(prefix));
  console.log('prefixCommands type:', typeof prefixCommands);
  console.log('prefixCommands size:', prefixCommands?.size ?? 0);
  console.log('Available commands:', [...(prefixCommands?.keys() ?? [])]);

  if (!prefixCommands || prefixCommands.size === 0) {
    console.warn('[WARN] prefixCommands is empty or not a Collection!');
  }

  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift().toLowerCase();
    console.log('Typed command:', commandName);

    const command = prefixCommands.get(commandName);
    if (command) {
      try {
        await command.execute(message, args);
      } catch (err) {
        console.error(`[ERROR] Command "${commandName}" failed:`, err);
      }
      return;
    } else {
      console.log(`Command "${commandName}" not found in prefixCommands.`);
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