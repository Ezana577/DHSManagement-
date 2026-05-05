const ALLOWED_ROLE = '1496636002650030230';
const REQUEST_CHANNEL_ID = '1445518845606498479';
const PING_ROLE_ID = '1496636002650030230';

export const name = 'requesttraining';

export async function execute(message, args) {
  if (message.channelId !== REQUEST_CHANNEL_ID) return;

  if (!message.member.roles.cache.has(ALLOWED_ROLE)) {
    const reply = await message.reply({ content: 'You do not have permission to use this command.' });
    setTimeout(() => reply.delete().catch(() => null), 5000);
    message.delete().catch(() => null);
    return;
  }

  message.delete().catch(() => null);

  await message.channel.send({
    content: `<@&${PING_ROLE_ID}>`,
    allowedMentions: { roles: [PING_ROLE_ID] },
  });

  await message.channel.send({
    content: `<@${message.author.id}> is requesting a training at this time. Please train them if you are available.`,
    allowedMentions: { users: [message.author.id] },
  });
}
