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

function parseTime(input) {
  const match = input.match(/^(\d+)(s|mi|h|d|mo|y)$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const now = Date.now();
  const map = {
    s:  1_000,
    mi: 60_000,
    h:  60 * 60_000,
    d:  24 * 60 * 60_000,
    mo: 30 * 24 * 60 * 60_000,
    y:  365 * 24 * 60 * 60_000,
  };
  return now + value * map[unit];
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
  const deadlineMs = parseTime(timeInput);

  if (!deadlineMs) {
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

  const unixDeadline = Math.floor(deadlineMs / 1000);
  const msRemaining = deadlineMs - Date.now();

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: 'DHS Activity Check' })
    .setTitle('Official DHS Activity Check')
    .setDescription(
      `${role}\n\nThis is an official DHS activity check done by <@${interaction.user.id}>.\n\nYou are required to react to this activity check with a ✅. Failure to do so will result in serious consequences.\n\n<@${interaction.client.user.id}> will automatically compile a list of those with the role who did not react once the deadline has passed.\n\n**Please make sure to react by:** <t:${unixDeadline}:F> (<t:${unixDeadline}:R>)`
    )
    .setTimestamp()
    .setFooter(FOOTER);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const msg = await interaction.channel.send({
    content: `${role}`,
    embeds: [embed],
  });

  await msg.react(CHECK_EMOJI).catch(() => null);
  await interaction.deleteReply().catch(() => null);

  const reactionCollector = msg.createReactionCollector({ time: msRemaining });

  reactionCollector.on('collect', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.emoji.name !== CHECK_EMOJI) {
      await reaction.users.remove(user.id).catch(() => null);
      return;
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member?.roles.cache.has(role.id)) {
      await reaction.users.remove(user.id).catch(() => null);
    }
  });

  reactionCollector.on('end', async () => {
    const fetchedMsg = await interaction.channel.messages.fetch(msg.id).catch(() => null);
    if (!fetchedMsg) return;

    const checkReaction = fetchedMsg.reactions.cache.get(CHECK_EMOJI);
    const reactedUserIds = new Set();

    if (checkReaction) {
      const users = await checkReaction.users.fetch().catch(() => null);
      if (users) users.forEach((u) => { if (!u.bot) reactedUserIds.add(u.id); });
    }

    const allMembers = await interaction.guild.members.fetch().catch(() => null);
    if (!allMembers) return;

    const roleMembers = allMembers.filter((m) => m.roles.cache.has(role.id) && !m.user.bot);
    const nonReacted  = roleMembers.filter((m) => !reactedUserIds.has(m.id));

    if (nonReacted.size === 0) {
      return msg.reply({
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
    }

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
  });
}
