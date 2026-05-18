import { activeChecks, sendReport } from '../commands/activitycheck.js';

export const name = 'messageReactionAdd';
export const once = false;

export async function execute(reaction, user) {
  try {
    if (user.bot) return;

    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (reaction.message.partial) {
      try { await reaction.message.fetch(); } catch { return; }
    }

    const msgId = reaction.message.id;
    const check = activeChecks.get(msgId);
    if (!check) return;

    if (reaction.emoji.name !== '✅') {
      await reaction.users.remove(user.id).catch(() => null);
      return;
    }

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id).catch(() => null);

    if (!member?.roles.cache.has(check.roleId)) {
      await reaction.users.remove(user.id).catch(() => null);
      return;
    }

    const freshMsg = await reaction.message.fetch().catch(() => null);
    if (!freshMsg) return;

    const checkReaction = freshMsg.reactions.cache.get('✅');
    const reactedIds = new Set();
    if (checkReaction) {
      const users = await checkReaction.users.fetch().catch(() => null);
      if (users) users.forEach((u) => { if (!u.bot) reactedIds.add(u.id); });
    }

    const allMembers = await guild.members.fetch().catch(() => null);
    if (!allMembers) return;

    const roleMembers = allMembers.filter((m) => m.roles.cache.has(check.roleId) && !m.user.bot);
    const allReacted = roleMembers.size > 0 && roleMembers.every((m) => reactedIds.has(m.id));

    if (allReacted) {
      await sendReport(msgId, reaction.client);
    }
  } catch (err) {
    console.error('[ActivityCheck] messageReactionAdd error:', err);
  }
}
