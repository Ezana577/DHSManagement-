// ─────────────────────────────────────────────────────────────
//  /panel  |  /panel edit  |  /panel switch
// ─────────────────────────────────────────────────────────────

import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import {
  hasLS, hasHR, hasSHR,
  errEmbed, successEmbed, buildPanelContainer,
  getNextTicketNumber, createTicketRecord, logTicketAction,
  getTicketByChannel, updateTicket,
  LOG_CHANNEL_ID, TICKET_CATEGORY,
  ROLES,
} from '../utils/ticketHelpers.js';
import supabase from '../utils/supabase.js';

// ─── Role IDs used for pings inside tickets ───────────────────────────────────
const HR_ROLE_ID  = ROLES.HR;
const SHR_ROLE_ID = ROLES.SHR;

// ─── Category configs ─────────────────────────────────────────────────────────
const CATEGORY_CONFIGS = {
  all: {
    label: 'All Categories',
    options: [
      { label: "General Inquiry's", emoji: '❓', value: 'general' },
      { label: "Appeal Inquiry's",  emoji: '📄', value: 'appeal'  },
      { label: "Report Inquiry's",  emoji: '🚨', value: 'report'  },
    ],
  },
  general: {
    label: 'General Only',
    options: [{ label: "General Inquiry's", emoji: '❓', value: 'general' }],
  },
  appeals: {
    label: 'Appeals Only',
    options: [{ label: "Appeal Inquiry's", emoji: '📄', value: 'appeal' }],
  },
  reports: {
    label: 'Reports Only',
    options: [{ label: "Report Inquiry's", emoji: '🚨', value: 'report' }],
  },
};

function buildSelectRow(configKey = 'all') {
  const config = CATEGORY_CONFIGS[configKey] ?? CATEGORY_CONFIGS.all;
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_open_select')
    .setPlaceholder('Select a category to open a ticket');
  for (const opt of config.options) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder().setLabel(opt.label).setEmoji(opt.emoji).setValue(opt.value)
    );
  }
  return new ActionRowBuilder().addComponents(menu);
}

// ─── Ticket category embeds ───────────────────────────────────────────────────
function buildGeneralEmbed() {
  return new EmbedBuilder()
    .setColor(0x1d72d7)
    .setTitle("❓ General Inquiry's")
    .setDescription(
      `Please state your inquiry and wait patiently as our support team reviews the ticket. Failure to state your inquiry after **10** minutes will result in a closure of your ticket.\n\n` +
      `> Failure to fill out the format above will result in a closure of this ticket. Additionally, do not ping any staff to respond to the ticket unless it has been past **3 hours**. Failure to follow this rule will result in the following: **Warning → Mute → Ticket closed.**`
    )
    .setFooter({ text: 'DHS | Support System' });
}

function buildAppealEmbed() {
  return new EmbedBuilder()
    .setColor(0x1d72d7)
    .setTitle("📄 Appeal Inquiry's")
    .setDescription(
      `Please make sure to fill out the fields below!\n\n` +
      `> \`User:\`\n` +
      `> \`Punished By:\`\n` +
      `> \`Punishment:\`\n` +
      `> \`Reason Given:\`\n` +
      `> \`Why Should This Be Removed:\`\n` +
      `> \`Any Supporting Evidence:\`\n\n` +
      `> Failure to fill out the format above will result in a closure of this ticket. Additionally, do not ping any staff to respond to the ticket unless it has been past **3 hours**. Failure to follow this rule will result in the following: **Warning → Mute → Ticket closed.**`
    )
    .setFooter({ text: 'DHS | Support System' });
}

function buildReportEmbed() {
  return new EmbedBuilder()
    .setColor(0x1d72d7)
    .setTitle("🚨 Report Inquiry's")
    .setDescription(
      `Please make sure to fill out the fields below!\n\n` +
      `> \`User/Agent:\`\n` +
      `> \`Date of Incident:\`\n` +
      `> \`Explanation:\`\n` +
      `> \`Evidence:\`\n\n` +
      `> Failure to fill out the format above will result in a closure of this ticket. Additionally, do not ping any staff to respond to the ticket unless it has been past **3 hours**. Failure to follow this rule will result in the following: **Warning → Mute → Ticket closed.**`
    )
    .setFooter({ text: 'DHS | Support System' });
}

// ─── Ticket action buttons (sent inside every ticket) ─────────────────────────
function buildTicketActionRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_close_request').setLabel('Request Close').setStyle(ButtonStyle.Secondary),
  );
}

// ─── Slash definition ─────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Manage the support panel.')
  .addSubcommand((sub) => sub.setName('send').setDescription('Send the support panel to this channel.'))
  .addSubcommand((sub) => sub.setName('edit').setDescription('Edit the existing panel message in place.'))
  .addSubcommand((sub) =>
    sub.setName('switch')
      .setDescription('Switch the category of this ticket.')
      .addStringOption((o) =>
        o.setName('config').setDescription('Which category set to show.').setRequired(true)
          .addChoices(
            { name: "All Categories",       value: 'all'     },
            { name: "❓ General Inquiry's", value: 'general' },
            { name: "📄 Appeal Inquiry's",  value: 'appeals' },
            { name: "🚨 Report Inquiry's",  value: 'reports' },
          )
      )
  );

export async function execute(interaction) {
  if (!hasHR(interaction.member)) {
    return interaction.reply({ embeds: [errEmbed('You do not have permission to manage the panel.')], flags: MessageFlags.Ephemeral });
  }

  const sub = interaction.options.getSubcommand();

  // ── /panel send ───────────────────────────────────────────────────────────
  if (sub === 'send') {
    const { data: existing } = await supabase.from('panel_state').select('*').eq('guild_id', interaction.guildId).maybeSingle();
    if (existing) {
      const ch  = interaction.guild.channels.cache.get(existing.channel_id);
      const msg = await ch?.messages.fetch(existing.message_id).catch(() => null);
      if (msg) {
        return interaction.reply({
          embeds: [errEmbed(`A panel already exists in <#${existing.channel_id}>. Use \`/panel edit\` to update it.`)],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    const configKey = existing?.active_config ?? 'all';
    const container = buildPanelContainer();
    const selectRow = buildSelectRow(configKey);
    const sent = await interaction.channel.send({ components: [container, selectRow], flags: MessageFlags.IsComponentsV2 });
    await supabase.from('panel_state').upsert({ guild_id: interaction.guildId, channel_id: interaction.channelId, message_id: sent.id, active_config: configKey, updated_at: new Date().toISOString() }, { onConflict: 'guild_id' });
    return interaction.reply({ embeds: [successEmbed('Panel sent.')], flags: MessageFlags.Ephemeral });
  }

  // ── /panel edit ───────────────────────────────────────────────────────────
  if (sub === 'edit') {
    const { data: panelRow } = await supabase.from('panel_state').select('*').eq('guild_id', interaction.guildId).maybeSingle();
    if (!panelRow) return interaction.reply({ embeds: [errEmbed('No panel found. Use `/panel send` first.')], flags: MessageFlags.Ephemeral });
    const ch  = interaction.guild.channels.cache.get(panelRow.channel_id);
    const msg = await ch?.messages.fetch(panelRow.message_id).catch(() => null);
    if (!msg) return interaction.reply({ embeds: [errEmbed('Panel message not found. Use `/panel send` to create a new one.')], flags: MessageFlags.Ephemeral });
    const configKey = panelRow.active_config ?? 'all';
    await msg.edit({ components: [buildPanelContainer(), buildSelectRow(configKey)], flags: MessageFlags.IsComponentsV2 });
    await supabase.from('panel_state').update({ updated_at: new Date().toISOString() }).eq('guild_id', interaction.guildId);
    return interaction.reply({ embeds: [successEmbed('Panel updated.')], flags: MessageFlags.Ephemeral });
  }

  // ── /panel switch ─────────────────────────────────────────────────────────
  if (sub === 'switch') {
    const configKey = interaction.options.getString('config');
    const { data: panelRow } = await supabase.from('panel_state').select('*').eq('guild_id', interaction.guildId).maybeSingle();
    if (!panelRow) return interaction.reply({ embeds: [errEmbed('No panel found. Use `/panel send` first.')], flags: MessageFlags.Ephemeral });

    if (panelRow.active_config === configKey) {
      return interaction.reply({
        embeds: [errEmbed(`The panel is already set to **${CATEGORY_CONFIGS[configKey]?.label ?? configKey}**.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const ch  = interaction.guild.channels.cache.get(panelRow.channel_id);
    const msg = await ch?.messages.fetch(panelRow.message_id).catch(() => null);
    if (!msg) return interaction.reply({ embeds: [errEmbed('Panel message not found. Use `/panel send` to create a new one.')], flags: MessageFlags.Ephemeral });

    await msg.edit({ components: [buildPanelContainer(), buildSelectRow(configKey)], flags: MessageFlags.IsComponentsV2 });
    await supabase.from('panel_state').update({ active_config: configKey, updated_at: new Date().toISOString() }).eq('guild_id', interaction.guildId);

    const categoryLabel = {
      all:     "All Categories",
      general: "❓ General Inquiry's",
      appeals: "📄 Appeal Inquiry's",
      reports: "🚨 Report Inquiry's",
    }[configKey] ?? configKey;

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x1d72d7)
          .setTitle('Ticket Panel Switch')
          .setDescription(`This ticket panel has been switched to: **${categoryLabel}**\nSwitched by: <@${interaction.user.id}>`)
          .setFooter({ text: 'DHS | Support System' }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}

// ─── Select menu: open a ticket ───────────────────────────────────────────────
async function handleTicketOpen(interaction) {
  const category = interaction.values[0];
  const guild    = interaction.guild;
  const member   = interaction.member;

  // ── Blacklist check — role OR user entry ──────────────────────────────────
  const memberRoleIds = [...member.roles.cache.keys()];
  const { data: blacklist } = await supabase
    .from('ticket_blacklist')
    .select('id')
    .eq('guild_id', guild.id)
    .eq('active', true)
    .or(`target_id.eq.${member.id},${memberRoleIds.map(id => `target_id.eq.${id}`).join(',')}`)
    .maybeSingle();

  if (blacklist) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Access Denied')
          .setDescription('You are currently blacklisted from opening tickets.')
          .setFooter({ text: 'DHS | Support System' }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  // ── Max 2 open tickets per category ──────────────────────────────────────
  const { data: openInCategory } = await supabase
    .from('tickets')
    .select('channel_id')
    .eq('guild_id', guild.id)
    .eq('owner_id', member.id)
    .eq('category', category)
    .eq('status', 'open');

  if (openInCategory && openInCategory.length >= 2) {
    const links = openInCategory.map(t => `<#${t.channel_id}>`).join(' and ');
    return interaction.reply({
      embeds: [errEmbed(`You already have 2 open tickets in this category: ${links}. Close one before opening another.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ticketNumber = await getNextTicketNumber(guild.id);
  const channelName  = `ticket-${ticketNumber}`;
  const parentCat    = guild.channels.cache.get(TICKET_CATEGORY);

  const ticketChannel = await guild.channels.create({
    name:   channelName,
    type:   ChannelType.GuildText,
    parent: parentCat?.id ?? null,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny:  [PermissionFlagsBits.ViewChannel] },
      { id: member.id,               allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: HR_ROLE_ID,              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: SHR_ROLE_ID,             allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: ROLES.LS,                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });

  await createTicketRecord({ guildId: guild.id, channelId: ticketChannel.id, ownerId: member.id, category, ticketNumber });
  await logTicketAction({ channelId: ticketChannel.id, actorId: member.id, action: 'open', detail: category });

  // ── Build the right embed ─────────────────────────────────────────────────
  let ticketEmbed;
  if (category === 'general')     ticketEmbed = buildGeneralEmbed();
  else if (category === 'appeal') ticketEmbed = buildAppealEmbed();
  else                            ticketEmbed = buildReportEmbed();

  // ── Spoiler ping: opener + HR + SHR ──────────────────────────────────────
  const pingContent = `||<@${member.id}> <@&${HR_ROLE_ID}> <@&${SHR_ROLE_ID}>||`;

  await ticketChannel.send({
    content:         pingContent,
    embeds:          [ticketEmbed],
    components:      [buildTicketActionRow()],
    allowedMentions: { users: [member.id], roles: [HR_ROLE_ID, SHR_ROLE_ID] },
  });

  // ── Ephemeral confirmation with actual channel link ───────────────────────
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x1d72d7)
        .setTitle('Ticket Opened')
        .setDescription(`Opened a new ticket <#${ticketChannel.id}>`)
        .setFooter({ text: 'DHS | Support System' }),
    ],
  });
}

// ─── Button: Claim ────────────────────────────────────────────────────────────
async function handleClaimButton(interaction) {
  if (!hasHR(interaction.member)) {
    return interaction.reply({ embeds: [errEmbed('You need HR+ to claim tickets.')], flags: MessageFlags.Ephemeral });
  }
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) return interaction.reply({ embeds: [errEmbed('Ticket data not found.')], flags: MessageFlags.Ephemeral });
  if (ticket.claimed_by) {
    return interaction.reply({ embeds: [errEmbed(`This ticket is already claimed by <@${ticket.claimed_by}>.`)], flags: MessageFlags.Ephemeral });
  }

  // Lock out other HR from sending — only claimer + opener + SHR+ keep access
  await interaction.channel.permissionOverwrites.edit(HR_ROLE_ID, { SendMessages: false });

  // Make sure claimer explicitly retains send access
  await interaction.channel.permissionOverwrites.edit(interaction.member, {
    ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
  });

  await updateTicket(interaction.channelId, { claimed_by: interaction.member.id });
  await logTicketAction({ channelId: interaction.channelId, actorId: interaction.member.id, action: 'claim' });

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x1d72d7)
        .setDescription(`<@${interaction.member.id}> has claimed this ticket.`)
        .setFooter({ text: 'DHS | Support System' }),
    ],
    allowedMentions: { parse: [] },
  });
}

// ─── Button: Close ────────────────────────────────────────────────────────────
async function handleCloseButton(interaction) {
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) return interaction.reply({ embeds: [errEmbed('Ticket data not found.')], flags: MessageFlags.Ephemeral });
  const isOwner = interaction.member.id === ticket.owner_id;
  if (!hasHR(interaction.member) && !isOwner) {
    return interaction.reply({ embeds: [errEmbed('You do not have permission to close this ticket.')], flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply();
  const { closeTicketFull } = await import('./close.js');
  await closeTicketFull(interaction, ticket, 'Closed via button.');
}

// ─── Button: Request Close ────────────────────────────────────────────────────
async function handleCloseRequestButton(interaction) {
  if (!hasHR(interaction.member)) {
    return interaction.reply({ embeds: [errEmbed('You need HR+ to request ticket closure.')], flags: MessageFlags.Ephemeral });
  }
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) return interaction.reply({ embeds: [errEmbed('Ticket data not found.')], flags: MessageFlags.Ephemeral });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_cr_accept:No reason provided.').setLabel('Accept & Close').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_cr_deny').setLabel('Deny & Keep Open').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff9900)
        .setTitle('Close Request')
        .setDescription(`<@${interaction.member.id}> has requested to close this ticket.\n\n**Reason:** No reason provided.`)
        .setFooter({ text: 'DHS | Support System' }),
    ],
    components: [row],
  });
}

// ─── Button: Edit Reason (on log embed) ──────────────────────────────────────
async function handleEditReason(interaction) {
  const channelId = interaction.customId.split(':')[1];
  const ticket    = await getTicketByChannel(channelId);
  if (!ticket) return interaction.reply({ embeds: [errEmbed('Ticket not found.')], flags: MessageFlags.Ephemeral });

  const ch = interaction.guild.channels.cache.get(channelId);
  if (ch) {
    const perms = ch.permissionsFor(interaction.member);
    if (!perms?.has(PermissionFlagsBits.ViewChannel) && !hasHR(interaction.member)) {
      return interaction.reply({ embeds: [errEmbed('You were removed from this ticket and cannot edit the close reason.')], flags: MessageFlags.Ephemeral });
    }
  }

  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x1d72d7).setDescription('Type the new close reason in this channel within **60 seconds**.').setFooter({ text: 'DHS | Support System' })],
    flags: MessageFlags.Ephemeral,
  });

  const collector = interaction.channel.createMessageCollector({ filter: (m) => m.author.id === interaction.member.id, max: 1, time: 60_000 });

  collector.on('collect', async (msg) => {
    const newReason = msg.content.slice(0, 500);
    msg.delete().catch(() => null);
    await updateTicket(channelId, { close_reason: newReason });
    await logTicketAction({ channelId, actorId: interaction.member.id, action: 'edit_reason', detail: newReason });
    const original    = interaction.message;
    const reasonIndex = original.embeds[0]?.fields?.findIndex((f) => f.name === 'Reason') ?? -1;
    if (reasonIndex !== -1) {
      const updated = EmbedBuilder.from(original.embeds[0]).spliceFields(reasonIndex, 1, { name: 'Reason', value: `\`${newReason}\``, inline: false });
      await original.edit({ embeds: [updated] }).catch(() => null);
    }
    await interaction.followUp({ embeds: [successEmbed('Close reason updated.')], flags: MessageFlags.Ephemeral });
  });

  collector.on('end', (collected) => {
    if (collected.size === 0) interaction.followUp({ embeds: [errEmbed('No response received. Reason not updated.')], flags: MessageFlags.Ephemeral }).catch(() => null);
  });
}

// ─── Close request accept/deny ────────────────────────────────────────────────
async function handleCrAccept(interaction) {
  const reason = interaction.customId.split(':').slice(1).join(':') || 'No reason provided.';
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) return interaction.reply({ embeds: [errEmbed('Ticket not found.')], flags: MessageFlags.Ephemeral });
  if (interaction.member.id !== ticket.owner_id) {
    return interaction.reply({ embeds: [errEmbed('Only the ticket opener can accept this close request.')], flags: MessageFlags.Ephemeral });
  }
  await interaction.deferUpdate();
  const { closeTicketFull } = await import('./close.js');
  await closeTicketFull(interaction, ticket, reason);
}

async function handleCrDeny(interaction) {
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) return interaction.reply({ embeds: [errEmbed('Ticket not found.')], flags: MessageFlags.Ephemeral });
  if (interaction.member.id !== ticket.owner_id) {
    return interaction.reply({ embeds: [errEmbed('Only the ticket opener can deny this close request.')], flags: MessageFlags.Ephemeral });
  }
  await interaction.update({
    embeds: [new EmbedBuilder().setColor(0x57f287).setDescription('Close request denied. The ticket will remain open.').setFooter({ text: 'DHS | Support System' })],
    components: [],
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export const selectMenus = {
  ticket_open_select: handleTicketOpen,
};

export const buttons = {
  ticket_claim:         handleClaimButton,
  ticket_close:         handleCloseButton,
  ticket_close_request: handleCloseRequestButton,
  ticket_edit_reason:   handleEditReason,
  ticket_cr_accept:     handleCrAccept,
  ticket_cr_deny:       handleCrDeny,
};
