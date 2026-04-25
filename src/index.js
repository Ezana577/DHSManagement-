import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent,
],
});

client.commands = new Collection();
client.buttons = new Collection();

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
event.execute(...args, client.commands, client.buttons);
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
const server = http.createServer((req, res) => {
res.writeHead(200, { 'Content-Type': 'text/plain' });
res.end('Bot is running');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
console.log(`[DHS] HTTP server listening on port ${PORT}`);
});

client.login(process.env.TOKEN);