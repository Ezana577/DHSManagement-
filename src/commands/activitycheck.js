import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';

const ALLOWED_ROLES = [
  '1400533620610957493',
  '1496619580188004415',
  '1496312707907977387',
];

const CHECK_EMOJI = '✅';
const FOOTER = { text: 'Department of Homeland Security • Activity Check' };
const COLOR = 0x1d72d7;

export const activeChecks = new Map();

function parseTime(input) {
  const match = input.match(/^(\d+)(s|mi|h|d|mo|y)$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
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

export async function sendReport(msgId, client) {
  const check = activeChecks.get(msgId);
  if (!check || check.reportSent) return;
  check.reportSent = true;
  clearTimeout(check.timer);

  try {
    const channel = await client.channels.fetch(check.channelId).catch(() => null);
    if (!channel) return;

    const msg = await channel.messages.fetch(msgId).catch(() => null);
    if (!msg) return;

    const guild = await client.guilds.fetch(check.guildId).catch(() => null);
    if (!guild) return;

    const checkReaction = msg.reactions.cache.get(CHECK_EMOJI);
    const reactedIds = new Set();

    if (checkReaction) {
      const users = await checkReaction.users.fetch().catch(() => null);
      if (users) users.forEach((u) => { if (!u.bot) reactedIds.add(u.id); });
    }

    const allMembers = await guild.members.fetch().catch(() => null);
    if (!allMembers) return;

    const roleMembers = allMembers.filter((m) => m.roles.cache.has(check.roleId) && !m.user.bot);
    const nonReacted = roleMembers.filter((m) => !reactedIds.has(m.id));

    if (nonReacted.size === 0) {
      await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setAuthor({ name: 'DHS Activity Check' })
            .setTitle('Activity Check — Results')
            .setDescription('All members with the role reacted. No absences recorded.')
            .setTimestamp()
            .setFooter(FOOTER),
        ],
      });
    } else {
      const list = nonReacted.map((m) => `• <@${m.id}>`).join('\n');
      await msg.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR)
            .setAuthor({ name: 'DHS Activity Check' })
            .setTitle('Activity Check — Results')
            .setDescription(`Below are those who did not react to the activity check:\n\n${list}`)
            .setTimestamp()
            .setFooter(FOOTER),
        ],
      });
    }
  } catch (err) {
    console.error('[ActivityCheck] sendReport error:', err);
  } finally {
    activeChecks.delete(msgId);
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

  const role = interaction.options.getRole('role');
  const timeInput = interaction.options.getString('time');
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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const msg = await interaction.channel.send({ content: `${role}`, embeds: [embed] });

  await msg.react(CHECK_EMOJI).catch(() => null);
  await interaction.deleteReply().catch(() => null);

  const timer = setTimeout(() => sendReport(msg.id, interaction.client), durationMs);

  activeChecks.set(msg.id, {
    roleId: role.id,
    guildId: interaction.guild.id,
    channelId: interaction.channel.id,
    reportSent: false,
    timer,
  });
}
