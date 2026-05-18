import { activeChecks, sendReport } from '../commands/activitycheck.js';

export const name = 'messageReactionAdd';
export const once = false;

export async function execute(reaction, user) {
  console.log(`[ReactionAdd] emoji=${reaction.emoji?.name} user=${user?.tag} bot=${user?.bot} msgId=${reaction.message?.id}`);

  try {
    if (user.bot) {
      console.log('[ReactionAdd] Skipping bot reaction');
      return;
    }

    if (reaction.partial) {
      console.log('[ReactionAdd] Fetching partial reaction...');
      try { await reaction.fetch(); } catch (e) { console.error('[ReactionAdd] Failed to fetch reaction:', e); return; }
    }
    if (reaction.message.partial) {
      console.log('[ReactionAdd] Fetching partial message...');
      try { await reaction.message.fetch(); } catch (e) { console.error('[ReactionAdd] Failed to fetch message:', e); return; }
    }

    const msgId = reaction.message.id;
    console.log(`[ReactionAdd] activeChecks size=${activeChecks.size} hasMsg=${activeChecks.has(msgId)}`);

    const check = activeChecks.get(msgId);
    if (!check) {
      console.log('[ReactionAdd] No active check for this message, ignoring');
      return;
    }

    console.log(`[ReactionAdd] Found active check — roleId=${check.roleId} emoji=${reaction.emoji.name}`);

    if (reaction.emoji.name !== '✅') {
      console.log('[ReactionAdd] Wrong emoji, removing...');
      await reaction.users.remove(user.id).catch((e) => console.error('[ReactionAdd] Remove failed:', e));
      return;
    }

    const guild = reaction.message.guild;
    const member = await guild.members.fetch(user.id).catch(() => null);
    console.log(`[ReactionAdd] member=${member?.user?.tag} hasRole=${member?.roles.cache.has(check.roleId)}`);

    if (!member?.roles.cache.has(check.roleId)) {
      console.log('[ReactionAdd] User does not have role, removing reaction...');
      await reaction.users.remove(user.id).catch((e) => console.error('[ReactionAdd] Remove failed:', e));
      return;
    }

    const freshMsg = await reaction.message.fetch().catch(() => null);
    if (!freshMsg) { console.log('[ReactionAdd] Could not fetch fresh message'); return; }

    const checkReaction = freshMsg.reactions.cache.get('✅');
    const reactedIds = new Set();
    if (checkReaction) {
      const users = await checkReaction.users.fetch().catch(() => null);
      if (users) users.forEach((u) => { if (!u.bot) reactedIds.add(u.id); });
    }

    const allMembers = await guild.members.fetch().catch(() => null);
    if (!allMembers) { console.log('[ReactionAdd] Could not fetch members'); return; }

    const roleMembers = allMembers.filter((m) => m.roles.cache.has(check.roleId) && !m.user.bot);
    console.log(`[ReactionAdd] roleMembers=${roleMembers.size} reactedIds=${reactedIds.size}`);
    roleMembers.forEach((m) => console.log(`  - ${m.user.tag} reacted=${reactedIds.has(m.id)}`));

    const allReacted = roleMembers.size > 0 && roleMembers.every((m) => reactedIds.has(m.id));
    console.log(`[ReactionAdd] allReacted=${allReacted}`);

    if (allReacted) {
      console.log('[ReactionAdd] All reacted — sending report early');
      await sendReport(msgId, reaction.client);
    }
  } catch (err) {
    console.error('[ReactionAdd] Uncaught error:', err);
  }
}
