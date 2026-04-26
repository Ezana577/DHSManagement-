const CHANNEL_ID = '1497755830341075109';
const MESSAGE_TEXT = 'This is an automated message by DHS Management. Please do not alter any permissions or mess with the bot, as this is used to keep the bot alive.';
const INTERVAL_MS = 5 * 60 * 1000;

export const name = 'clientReady';
export const once = true;

export async function execute(client) {
  console.log(`[DHS] Logged in as ${client.user.tag}`);

  const channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    console.warn('[AUTO] Channel not found or not text-based:', CHANNEL_ID);
    return;
  }

  let lastMessage = null;

  const send = async () => {
    try {
      if (lastMessage) {
        await lastMessage.delete().catch(() => null);
      }
      lastMessage = await channel.send({ content: MESSAGE_TEXT });
    } catch (err) {
      console.error('[AUTO] Failed to send automated message:', err);
    }
  };

  await send();
  setInterval(send, INTERVAL_MS);
}
