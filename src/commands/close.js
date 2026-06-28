import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import {
  hasHR,
  getTicketByChannel, updateTicket, logTicketAction,
  errEmbed, LOG_CHANNEL_ID, ROLES,
} from '../utils/ticketHelpers.js';
import { generateTranscript } from '../utils/transcript.js';
import supabase from '../utils/supabase.js';

export const data = new SlashCommandBuilder()
  .setName('close')
  .setDescription('Immediately close this ticket. [HR+ or ticket owner]')
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason for closing.').setRequired(false)
  );

export async function execute(interaction) {
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) {
    return interaction.reply({ embeds: [errEmbed('This command can only be used inside a ticket channel.')], flags: MessageFlags.Ephemeral });
  }
  if (ticket.status === 'closed') {
    return interaction.reply({ embeds: [errEmbed('This ticket is already closed.')], flags: MessageFlags.Ephemeral });
  }
  const isOwner = interaction.member.id === ticket.owner_id;
  if (!hasHR(interaction.member) && !isOwner) {
    return interaction.reply({ embeds: [errEmbed('You need HR+ or must be the ticket owner to close this ticket.')], flags: MessageFlags.Ephemeral });
  }
  const reason = interaction.options.getString('reason') ?? 'No reason provided.';
  await interaction.deferReply();
  await closeTicketFull(interaction, ticket, reason);
}

// ─── Shared close logic ───────────────────────────────────────────────────────
export async function closeTicketFull(interaction, ticket, reason) {
  const channel = interaction.channel;
  const guild   = interaction.guild;

  // Generate transcript HTML
  const html = await generateTranscript(channel);

  const transcriptKey = `transcripts/ticket-${ticket.ticket_number}-${Date.now()}.html`;
  const { error: storeErr } = await supabase.storage
    .from('transcripts')
    .upload(transcriptKey, Buffer.from(html, 'utf-8'), { contentType: 'text/html', upsert: true });

  let transcriptUrl = null;
  if (!storeErr) {
    const { data: urlData } = supabase.storage.from('transcripts').getPublicUrl(transcriptKey);
    transcriptUrl = urlData?.publicUrl ?? null;
  }

  const now        = new Date();
  const openedUnix = Math.floor(new Date(ticket.opened_at).getTime() / 1000);
  const closedUnix = Math.floor(now.getTime() / 1000);

  await updateTicket(channel.id, {
    status:         'closed',
    closed_by:      interaction.member.id,
    closed_at:      now.toISOString(),
    close_reason:   reason,
    transcript_url: transcriptUrl,
  });

  await logTicketAction({ channelId: channel.id, actorId: interaction.member.id, action: 'close', detail: reason });

  const claimedByValue = ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Unclaimed';

  // ── Log channel embed ─────────────────────────────────────────────────────
  const logEmbed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('Ticket Closed')
    .addFields(
      { name: 'Ticket ID',   value: `ticket-${ticket.ticket_number}`, inline: false },
      { name: 'Opened By',   value: `<@${ticket.owner_id}>`,          inline: false },
      { name: 'Closed By',   value: `<@${interaction.member.id}>`,    inline: false },
      { name: 'Open Time',   value: `<t:${openedUnix}:F>`,            inline: false },
      { name: 'Close Time',  value: `<t:${closedUnix}:F>`,            inline: false },
      { name: 'Claimed By',  value: claimedByValue,                   inline: false },
      { name: 'Reason',      value: `\`${reason}\``,                  inline: false },
    )
    .setFooter({ text: 'DHS | Support System' });

  const logButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_edit_reason:${channel.id}`)
      .setLabel('Edit Reason')
      .setStyle(ButtonStyle.Secondary),
  );
  if (transcriptUrl) {
    logButtons.addComponents(
      new ButtonBuilder().setLabel('View Transcript').setStyle(ButtonStyle.Link).setURL(transcriptUrl),
    );
  }

  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (logChannel?.isTextBased()) {
    await logChannel.send({ embeds: [logEmbed], components: [logButtons], allowedMentions: { parse: [] } });
  }

  // ── DM ticket opener ──────────────────────────────────────────────────────
  try {
    const owner = await guild.members.fetch(ticket.owner_id).catch(() => null);
    if (owner) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0x1d72d7)
        .setTitle('Your Ticket Has Been Closed')
        .addFields(
          { name: 'Ticket ID',   value: `ticket-${ticket.ticket_number}`, inline: false },
          { name: 'Opened By',   value: `<@${ticket.owner_id}>`,          inline: false },
          { name: 'Closed By',   value: `<@${interaction.member.id}>`,    inline: false },
          { name: 'Open Time',   value: `<t:${openedUnix}:F>`,            inline: false },
          { name: 'Close Time',  value: `<t:${closedUnix}:F>`,            inline: false },
          { name: 'Claimed By',  value: claimedByValue,                   inline: false },
          { name: 'Reason',      value: `\`${reason}\``,                  inline: false },
        )
        .setFooter({ text: 'DHS | Support System' });

      const dmComponents = [];
      if (transcriptUrl) {
        dmComponents.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('View Transcript').setStyle(ButtonStyle.Link).setURL(transcriptUrl),
          )
        );
      }

      await owner.send({ embeds: [dmEmbed], components: dmComponents, allowedMentions: { parse: [] } }).catch(() => null);
    }
  } catch {}

  setTimeout(() => channel.delete(`Ticket closed by ${interaction.member.user.tag}`).catch(() => null), 4000);
}
