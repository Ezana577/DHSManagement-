import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
],
});

client.commands = new Collection();
client.prefixCommands = new Collection();
client.buttons = new Collection();
client.modals = new Collection();

const originUserMap = new Map();

const commandFiles = readdirSync(join(__dirname, 'commands')).filter((f) => f.endsWith('.js'));
const commandPayloads = [];

for (const file of commandFiles) {
const command = await import(`./commands/${file}`);
client.commands.set(command.data.name, command);
commandPayloads.push(command.data.toJSON());

if (command.buttons) {
for (const [id, handler] of Object.entries(command.buttons)) {
client.buttons.set(id, handler);
}
}

if (command.modals) {
for (const [id, handler] of Object.entries(command.modals)) {
client.modals.set(id, handler);
}
}
}

const prefixCommandFiles = readdirSync(join(__dirname, 'prefixCommands')).filter((f) => f.endsWith('.js'));

for (const file of prefixCommandFiles) {
const command = await import(`./prefixCommands/${file}`);
client.prefixCommands.set(command.name, {
execute: async (message, args) => {
const sent = await command.execute(message, args);
if (sent?.id) originUserMap.set(sent.id, message.author.id);
},
});

if (command.buttons) {
for (const [id, handler] of Object.entries(command.buttons)) {
client.buttons.set(id, (interaction) => {
const originUserId = originUserMap.get(interaction.message.id);
return handler(interaction, originUserId);
});
}
}

if (command.modals) {
for (const [id, handler] of Object.entries(command.modals)) {
client.modals.set(id, (interaction) => {
const originUserId = originUserMap.get(interaction.message?.id);
return handler(interaction, originUserId);
});
}
}
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
try {
await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
body: commandPayloads,
});
console.log('[DHS] Slash commands registered.');
} catch (err) {
console.error('[DHS] Failed to register slash commands:', err);
}

const eventFiles = readdirSync(join(__dirname, 'events')).filter((f) => f.endsWith('.js'));
for (const file of eventFiles) {
const event = await import(`./events/${file}`);
const handler = (...args) => {
if (event.name === 'interactionCreate') {
event.execute(...args, client.commands, client.buttons, client.modals);
} else if (event.name === 'messageCreate') {
event.execute(...args, client.prefixCommands);
} else {
event.execute(...args);
}
};

if (event.once) {
client.once(event.name, handler);
} else {
client.on(event.name, handler);
}
}

client.login(process.env.TOKEN);