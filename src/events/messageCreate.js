import { EmbedBuilder } from ‘discord.js’;
import { getPrefix, setPrefix } from ‘../utils/prefixStore.js’;
import { Style } from ‘../utils/style.js’;

const ALLOWED_ROLES = [
‘1400533620610957493’,
‘1496312707907977387’,
‘1496619580188004415’,
];

export const name = ‘messageCreate’;
export const once = false;

function hasAllowedRole(member) {
return ALLOWED_ROLES.some((id) => member.roles.cache.has(id));
}

export async function execute(message) {
if (message.author.bot) return;

const prefix = getPrefix();

if (message.content.startsWith(`${prefix}prefix `)) {
if (!hasAllowedRole(message.member)) {
const denied = await message.reply({ content: ‘You do not have permission to use this command.’ });
setTimeout(() => denied.delete().catch(() => null), 5000);
return;
}

```
const newPrefix = message.content.slice(`${prefix}prefix `.length).trim();

if (!newPrefix) {
  const invalid = await message.reply({ content: 'Please provide a new prefix.' });
  setTimeout(() => invalid.delete().catch(() => null), 5000);
  return;
}

const oldPrefix = getPrefix();
setPrefix(newPrefix);

const embed = new EmbedBuilder()
  .setColor(Style.color)
  .setTitle('Prefix Updated')
  .addFields(
    { name: 'Previous Prefix', value: `\`${oldPrefix}\``, inline: true },
    { name: 'New Prefix', value: `\`${newPrefix}\``, inline: true }
  )
  .setFooter(Style.footer('prefix'));

const reply = await message.reply({ embeds: [embed] });
setTimeout(() => reply.delete().catch(() => null), 10000);
return;
```

}

const isMentioned =
message.mentions.has(message.client.user) &&
!message.mentions.everyone;

if (!isMentioned) return;

const embed = new EmbedBuilder()
.setColor(Style.color)
.setTitle(‘Department of Homeland Security’)
.setDescription(
`Greetings. I am DHS Management. My prefix is \```${getPrefix()}```\nFor a full list of commands, use the slash command menu.`
)
.setFooter(Style.timestamp());

const reply = await message.reply({ embeds: [embed] });

setTimeout(() => {
reply.delete().catch(() => null);
}, 10000);
}