import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../data');
mkdirSync(dataDir, { recursive: true });

// Persist active checks to disk so they survive bot restarts.
const db = new Low(new JSONFile(join(dataDir, 'activitychecks.json')), { checks: [] });
await db.read();
db.data = { checks: [], ...db.data };
await db.write();

const ALLOWED_ROLES = [
  '1400533620610957493',
  '1496619580188004415',
  '1496312707907977387',
];

const CHECK_EMOJI = '✅';
const FOOTER = { text: 'Department of Homeland Security • Activity Check' };
const COLOR  = 0x1d72d7;

// In-memory map of msgId -> { ...record, timer }
export const activeChecks = new Map();

// Guards against sendReport firing twice (timer + reaction handler race).
const inProgress = new Set();

function parseTime(input) {
  const match = input.match(/^(\d+)(s|mi|h|d|mo|y)$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit  = match[2].toLowerCase();
  const map = {
    s:  1_000,
    mi: 60_000,
    h:  60 * 60_000,
    d:  24 * 60 * 60_000,
    mo: 30 * 24 * 60 * 60_000,
    y:  365 * 24 * 60 * 60_000,
  };
  return value * map[unit];
}

async function removeCheck(msgId) {
  const check = activeChecks.get(msgId);
  if (check) { clearTimeout(check.timer); activeChecks.delete(msgId); }
  db.data.checks = db.data.checks.filter((c) => c.msgId !== msgId);
  await db.write();
}

export async function sendReport(msgId, client) {
  const record = db.data.checks.find((c) => c.msgId === msgId);
  if (!record) return;

  try {
    const channel = await client.channels.fetch(record.channelId).catch(() => null);
    if (!channel) return;

    const msg = await channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return;

    const guild = await client.guilds.fetch(record.guildId).catch(() => null);
    if (!guild) return;

    const checkReaction = msg.reactions.cache.get(CHECK_EMOJI);
    const reactedIds = new Set();

    if (checkReaction) {
      const users = await checkReaction.users.fetch().catch(() => null);
      if (users) users.forEach((u) => { if (!u.bot) reactedIds.add(u.id); });
    }

    const allMembers = await guild.members.fetch().catch(() => null);
    if (!allMembers) return;

    const roleMembers = allMembers.filter((m) => m.roles.cache.has(record.roleId) && !m.user.bot);
    const nonReacted  = roleMembers.filter((m) => !reactedIds.has(m.id));

    const description = nonReacted.size === 0
      ? 'All members with the role reacted. No absences recorded.'
      : `Below are those who did not react to the activity check:\n\n${nonReacted.map((m) => `• <@${m.id}>`).join('\n')}`;

    await msg.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setAuthor({ name: 'DHS Activity Check' })
          .setTitle('Activity Check — Results')
          .setDescription(description)
          .setTimestamp()
          .setFooter(FOOTER),
      ],
    });
  } catch (err) {
    console.error('[ActivityCheck] sendReport error:', err);
  } finally {
    await removeCheck(msgId);
  }
}

// Called once on bot startup — reschedules any checks that survived a restart.
export async function restoreChecks(client) {
  await db.read();
  const now = Date.now();

  for (const record of db.data.checks) {
    const remaining = record.fireAt - now;

    if (remaining <= 0) {
      // Deadline already passed while the bot was offline — send the report now.
      await sendReport(record.msgId, client);
    } else {
      const timer = setTimeout(() => sendReport(record.msgId, client), remaining);
      activeChecks.set(record.msgId, { ...record, timer });
      console.log(`[ActivityCheck] Restored check msgId=${record.msgId} fires in ${Math.round(remaining / 1000)}s`);
    }
  }
}

export const data = new SlashCommandBuilder()
  .setName('activitycheck')
  .setDescription('Send an official DHS activity check.')
  .addRoleOption((o) =>
    o.setName('role').setDescription('The role to ping and check.').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('time')
      .setDescription('Deadline — e.g. 30s, 10mi, 2h, 1d, 2mo, 1y')
      .setRequired(true)
  );

export async function execute(interaction) {
  const hasPermission = ALLOWED_ROLES.some((id) => interaction.member.roles.cache.has(id));
  if (!hasPermission) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setAuthor({ name: 'DHS Activity Check' })
          .setDescription('> You do not have permission to use this command.')
          .setTimestamp()
          .setFooter(FOOTER),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  const role       = interaction.options.getRole('role');
  const timeInput  = interaction.options.getString('time');
  const durationMs = parseTime(timeInput);

  if (!durationMs) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setAuthor({ name: 'DHS Activity Check' })
          .setDescription('> Invalid time format.\n\nValid formats: `30s` `10mi` `2h` `1d` `2mo` `1y`')
          .setTimestamp()
          .setFooter(FOOTER),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  let interactionAlive = true;
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch {
    interactionAlive = false;
  }

  const unixDeadline = Math.floor((Date.now() + durationMs) / 1000);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: 'DHS Activity Check' })
    .setTitle('Official DHS Activity Check')
    .setDescription(
      `${role}\n\nThis is an official DHS activity check done by <@${interaction.user.id}>.\n\nYou are required to react to this activity check with ✅. Failure to do so will result in serious consequences.\n\n<@${interaction.client.user.id}> will automatically compile a list of those with the role who did not react once the deadline has passed.\n\n**Please make sure to react by:** <t:${unixDeadline}:F> (<t:${unixDeadline}:R>)`
    )
    .setTimestamp()
    .setFooter(FOOTER);

  const msg = await interaction.channel.send({ content: `${role}`, embeds: [embed] });
  await msg.react(CHECK_EMOJI).catch(() => null);

  // Persist to disk before scheduling — guarantees survival across restarts.
  const fireAt = Date.now() + durationMs;
  const record = { msgId: msg.id, roleId: role.id, guildId: interaction.guild.id, channelId: interaction.channel.id, fireAt };
  db.data.checks.push(record);
  await db.write();

  // Store the full record AND the timer so the reaction handler can access roleId.
  const timer = setTimeout(() => sendReport(msg.id, interaction.client), durationMs);
  activeChecks.set(msg.id, { ...record, timer });

  if (interactionAlive) {
    await interaction.deleteReply().catch(() => null);
  }

  console.log(`[ActivityCheck] Check registered — msgId=${msg.id} roleId=${role.id} duration=${durationMs}ms`);
}
