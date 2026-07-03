import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Collection, REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import http from 'http';
import { commands as ticketCommands } from './ticketCommands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Global error catching ─────────────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
    console.error('[DHS] !! UNHANDLED REJECTION !!');
    console.error('[DHS] Promise:', promise);
    console.error('[DHS] Reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[DHS] !! UNCAUGHT EXCEPTION !!');
    console.error(err);
});

process.on('uncaughtExceptionMonitor', (err) => {
    console.error('[DHS] !! UNCAUGHT EXCEPTION MONITOR !!');
    console.error(err);
});

console.log('[DHS] Process starting...');
console.log('[DHS] Node version:', process.version);
console.log('[DHS] ENV check:');
console.log('  TOKEN:', process.env.TOKEN ? `SET (${process.env.TOKEN.slice(0,10)}...)` : 'MISSING ❌');
console.log('  CLIENT_ID:', process.env.CLIENT_ID || 'MISSING ❌');
console.log('  GUILD_ID:', process.env.GUILD_ID || 'MISSING ❌');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET ✓' : 'MISSING ❌');
console.log('  SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'SET ✓' : 'MISSING ❌');
console.log('  LOG_CHANNEL_ID:', process.env.LOG_CHANNEL_ID || 'MISSING ❌');
console.log('  CLOSE_LOG_CHANNEL_ID:', process.env.CLOSE_LOG_CHANNEL_ID || 'MISSING ❌');
console.log('  ROLE_HR:', process.env.ROLE_HR || 'MISSING ❌');
console.log('  ROLE_SHR:', process.env.ROLE_SHR || 'MISSING ❌');
console.log('  ROLE_LS:', process.env.ROLE_LS || 'MISSING ❌');
console.log('  ROLE_EXEC:', process.env.ROLE_EXEC || '(not set)');
console.log('  ROLE_OIG:', process.env.ROLE_OIG || '(not set)');
console.log('  PORT:', process.env.PORT || '3000 (default)');

// ── HTTP keepalive server — starts FIRST so Render detects port immediately ───
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running');
});

server.on('error', (err) => {
    console.error('[DHS] HTTP server error:', err);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[DHS] HTTP server listening on port ${PORT}`);
});

// ── Discord client setup ──────────────────────────────────────────────────────
console.log('[DHS] Creating Discord client...');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.commands       = new Collection();
client.prefixCommands = new Collection();
client.buttons        = new Collection();
client.modals         = new Collection();

const originUserMap   = new Map();
const commandPayloads = [];

// ── Load slash commands from /commands folder ─────────────────────────────────
console.log('[DHS] Loading /commands folder...');
const commandFiles = readdirSync(join(__dirname, 'commands')).filter((f) => f.endsWith('.js'));
console.log('[DHS] Command files found:', commandFiles);

for (const file of commandFiles) {
    try {
        console.log(`[DHS]   Loading commands/${file}...`);
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
        console.log(`[DHS]   ✓ Loaded: ${command.data.name}`);
    } catch (err) {
        console.error(`[DHS]   ✗ FAILED to load commands/${file}:`, err);
    }
}

// ── Load ticket commands ──────────────────────────────────────────────────────
console.log('[DHS] Loading ticketCommands...');
try {
    for (const cmd of ticketCommands) {
        client.commands.set(cmd.data.name, cmd);
        commandPayloads.push(cmd.data.toJSON());

        if (cmd.buttons) {
            for (const [id, handler] of Object.entries(cmd.buttons)) {
                client.buttons.set(id, handler);
            }
        }
        if (cmd.modals) {
            for (const [id, handler] of Object.entries(cmd.modals)) {
                client.modals.set(id, handler);
            }
        }
        if (cmd.selectMenus) {
            for (const [id, handler] of Object.entries(cmd.selectMenus)) {
                client.buttons.set(id, handler);
            }
        }
        console.log(`[DHS]   ✓ Loaded ticket command: ${cmd.data.name}`);
    }
} catch (err) {
    console.error('[DHS] ✗ FAILED to load ticketCommands:', err);
}

console.log('[DHS] Registered slash commands:', [...client.commands.keys()]);
console.log('[DHS] Registered button/select handlers:', [...client.buttons.keys()]);

// ── Load prefix commands ──────────────────────────────────────────────────────
console.log('[DHS] Loading /prefixCommands folder...');
const prefixCommandFiles = readdirSync(join(__dirname, 'prefixCommands')).filter((f) => f.endsWith('.js'));
console.log('[DHS] prefixCommands folder contents:', prefixCommandFiles);

for (const file of prefixCommandFiles) {
    try {
        console.log(`[DHS]   Loading prefixCommands/${file}...`);
        const command = await import(`./prefixCommands/${file}`);

        if (!command.name || typeof command.execute !== 'function') {
            console.warn(`[WARN] Skipping ${file} — missing name or execute. Keys: ${Object.keys(command)}`);
            continue;
        }

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
        console.log(`[DHS]   ✓ Loaded prefix command: ${command.name}`);
    } catch (err) {
        console.error(`[DHS]   ✗ FAILED to load prefixCommands/${file}:`, err);
    }
}

console.log('[DHS] Registered prefix commands:', [...client.prefixCommands.keys()]);

// ── Register slash commands with Discord ─────────────────────────────────────
console.log('[DHS] Registering slash commands with Discord API...');
console.log(`[DHS] Targeting guild: ${process.env.GUILD_ID}`);
console.log(`[DHS] Total commands to register: ${commandPayloads.length}`);

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
try {
    const result = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commandPayloads }
    );
    console.log(`[DHS] ✓ Slash commands registered successfully. Count: ${result.length}`);
} catch (err) {
    console.error('[DHS] ✗ FAILED to register slash commands:');
    console.error('  Status:', err.status);
    console.error('  Code:', err.code);
    console.error('  Message:', err.message);
    console.error('  Raw error:', err);
}

// ── Load events ───────────────────────────────────────────────────────────────
console.log('[DHS] Loading events...');
const eventFiles = readdirSync(join(__dirname, 'events')).filter((f) => f.endsWith('.js'));
console.log('[DHS] Event files found:', eventFiles);

for (const file of eventFiles) {
    try {
        const event = await import(`./events/${file}`);
        console.log(`[DHS]   Registering event: ${event.name} (once: ${event.once ?? false})`);
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
        console.log(`[DHS]   ✓ Event registered: ${event.name}`);
    } catch (err) {
        console.error(`[DHS]   ✗ FAILED to load events/${file}:`, err);
    }
}

// ── Login ─────────────────────────────────────────────────────────────────────
console.log('[DHS] Logging into Discord...');
try {
    await client.login(process.env.TOKEN);
    console.log('[DHS] ✓ Login successful');
} catch (err) {
    console.error('[DHS] ✗ FAILED to login to Discord:');
    console.error('  Message:', err.message);
    console.error('  Code:', err.code);
    console.error('  Raw error:', err);
}

client.once('ready', () => {
    console.log(`[DHS] ✓ Bot is ready! Logged in as ${client.user.tag}`);
    console.log(`[DHS] Serving ${client.guilds.cache.size} guild(s)`);
});
