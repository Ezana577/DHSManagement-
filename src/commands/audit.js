import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  AuditLogEvent,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from 'discord.js';

const MAX_ENTRIES = 10;
const FETCH_LIMIT = 25;

export const data = new SlashCommandBuilder()
  .setName('audit')
  .setDescription('Audit log lookup tools.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
  .addSubcommand((sub) =>
    sub
      .setName('user')
      .setDescription("Check a user's moderation history from the audit logs.")
      .addUserOption((o) =>
        o.setName('user').setDescription('The user to look up.').setRequired(true)
      )
  );

function formatDuration(ms) {
  if (ms <= 0) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes ? `${hours}h ${remMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

function buildRoleEntries(auditLogs, targetId, guild) {
  const results = [];
  for (const entry of auditLogs.entries.values()) {
    if (!entry.target || entry.target.id !== targetId) continue;

    for (const change of entry.changes ?? []) {
      if (change.key !== '$add' && change.key !== '$remove') continue;
      const roles = Array.isArray(change.new) ? change.new : [];
      if (!roles.length) continue;

      const action = change.key === '$add' ? 'Role Added' : 'Role Removed';
      const roleNames = roles
        .map((r) => guild.roles.cache.get(r.id)?.toString() ?? r.name)
        .join(', ');

      results.push({
        action,
        moderator: entry.executor ? `<@${entry.executor.id}>` : 'Unknown',
        timestamp: entry.createdTimestamp,
        details: roleNames,
      });
    }
  }
  return results;
}

function buildTimeoutEntries(auditLogs, targetId) {
  const results = [];
  for (const entry of auditLogs.entries.values()) {
    if (!entry.target || entry.target.id !== targetId) continue;

    for (const change of entry.changes ?? []) {
      if (change.key !== 'communication_disabled_until') continue;

      const newValue = change.new ? new Date(change.new).getTime() : null;
      const isTimeout = newValue && newValue > Date.now();

      if (isTimeout) {
        const duration = formatDuration(newValue - entry.createdTimestamp);
        results.push({
          action: 'Timeout Applied',
          moderator: entry.executor ? `<@${entry.executor.id}>` : 'Unknown',
          timestamp: entry.createdTimestamp,
          details: duration ? `Duration: ${duration}` : `Until <t:${Math.floor(newValue / 1000)}:f>`,
        });
      } else {
        results.push({
          action: 'Timeout Removed',
          moderator: entry.executor ? `<@${entry.executor.id}>` : 'Unknown',
          timestamp: entry.createdTimestamp,
          details: 'Timeout cleared before expiry.',
        });
      }
    }
  }
  return results;
}

function buildSimpleEntries(auditLogs, targetId, actionLabel) {
  const results = [];
  for (const entry of auditLogs.entries.values()) {
    if (!entry.target || entry.target.id !== targetId) continue;
    results.push({
      action: actionLabel,
      moderator: entry.executor ? `<@${entry.executor.id}>` : 'Unknown',
      timestamp: entry.createdTimestamp,
      details: entry.reason ? `Reason: ${entry.reason}` : 'No reason provided.',
    });
  }
  return results;
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub !== 'user') return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetUser = interaction.options.getUser('user');
  const guild = interaction.guild;

  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
    const errorContainer = new ContainerBuilder()
      .setAccentColor(0xc0392b)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('## Missing Permissions')
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          'I need the **View Audit Log** permission to run this command.'
        )
      );

    await interaction.editReply({
      components: [errorContainer],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  let entries = [];

  try {
    const [roleLogs, updateLogs, kickLogs, banAddLogs, banRemoveLogs] = await Promise.all([
      guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: FETCH_LIMIT }),
      guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: FETCH_LIMIT }),
      guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: FETCH_LIMIT }),
      guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: FETCH_LIMIT }),
      guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: FETCH_LIMIT }),
    ]);

    entries = [
      ...buildRoleEntries(roleLogs, targetUser.id, guild),
      ...buildTimeoutEntries(updateLogs, targetUser.id),
      ...buildSimpleEntries(kickLogs, targetUser.id, 'Kicked'),
      ...buildSimpleEntries(banAddLogs, targetUser.id, 'Banned'),
      ...buildSimpleEntries(banRemoveLogs, targetUser.id, 'Ban Removed'),
    ];
  } catch (err) {
    console.error('[DHS] Failed to fetch audit logs:', err);

    const errorContainer = new ContainerBuilder()
      .setAccentColor(0xc0392b)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('## Audit Lookup Failed')
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('An error occurred while fetching the audit logs. Please try again.')
      );

    await interaction.editReply({
      components: [errorContainer],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  entries.sort((a, b) => b.timestamp - a.timestamp);

  const container = new ContainerBuilder()
    .setAccentColor(0x1d72d7)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## User Audit Report')
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Target:** <@${targetUser.id}>\n**Records Found:** ${entries.length}`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

  if (entries.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'No recorded moderation actions were found for this user in the available audit log history.'
      )
    );
  } else {
    const shown = entries.slice(0, MAX_ENTRIES);

    for (const entry of shown) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${entry.action}**\n` +
          `Moderator: ${entry.moderator}\n` +
          `When: <t:${Math.floor(entry.timestamp / 1000)}:f>\n` +
          `Details: ${entry.details}`
        )
      );
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );
    }

    if (entries.length > MAX_ENTRIES) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Showing the ${MAX_ENTRIES} most recent of ${entries.length} results. Discord's audit logs only retain up to 45 days of history.`
        )
      );
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
      );
    }
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('-# DHS System | Audit')
  );

  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}
