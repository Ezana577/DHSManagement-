// ─────────────────────────────────────────────────────────────────────────────
//  /embed — Professional Embed Builder (v2)
//
//  Lets an Administrator compose up to 10 embeds and up to 5 rows of
//  buttons/select menus, send them to any channel, edit an existing
//  message the bot sent, or import/export the raw Discord JSON.
//
//  SESSION MODEL
//  A "session" is one open builder panel, keyed by a random id embedded in
//  every customId (`prefix:sessionId`). It holds:
//    embeds:  [{ base: {...embed props...}, fields: [...] }, ...]   (max 10)
//    currentEmbedIndex: which embed the Field/Text/Author/Footer buttons edit
//    rows:    [{ type: 'buttons', buttons: [...] } | { type: 'select', select: {...} }]  (max 5)
//    sourceMessage: { channelId, messageId } | null — set when loaded via
//                   `source_message`; if the bot authored that message,
//                   "Send" edits it in place instead of posting a new one.
//
//  WHY A PANEL AT ALL: Discord caps a slash command at 25 options, which
//  can't represent N embeds x fields x components. The panel (buttons +
//  modals) is the standard workaround and doubles as the "expand later"
//  surface — new component types just need a new "Add ___" button + modal.
// ─────────────────────────────────────────────────────────────────────────────

import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  Colors,
  parseEmoji,
  AttachmentBuilder,
} from 'discord.js';

// ───────────────────────────── Constants ──────────────────────────────────

const MAX_EMBEDS = 10;
const MAX_ROWS = 5;
const MAX_BUTTONS_PER_ROW = 5;
const MAX_FIELDS_PER_EMBED = 25;
const SESSION_TTL_MS = 15 * 60 * 1000; // matches interaction token lifetime
const LOG_CHANNEL_ID = '1400610140406808768';

const LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  footerText: 2048,
  authorName: 256,
  total: 6000, // per embed
};

// In-memory session store. See header comment for shape.
const sessions = new Map();

// ───────────────────────────── Generic helpers ──────────────────────────────

function isValidUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveColor(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (trimmed.toLowerCase() === 'random') return Math.floor(Math.random() * 0xffffff);

  const namedKey = Object.keys(Colors).find((key) => key.toLowerCase() === trimmed.toLowerCase().replace(/\s+/g, ''));
  if (namedKey) return Colors[namedKey];

  const hexMatch = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    return parseInt(hex, 16);
  }
  return undefined; // invalid
}

function parseBool(value, fallback = false) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  return ['true', 'yes', 'y', '1'].includes(String(value).trim().toLowerCase());
}

function newEmptyEmbed() {
  return {
    base: {
      title: null, description: null, url: null, color: null,
      authorName: null, authorIconUrl: null, authorUrl: null,
      footerText: null, footerIconUrl: null,
      thumbnailUrl: null, imageUrl: null, timestamp: false,
    },
    fields: [],
  };
}

// ───────────────────────────── Embed build/validate ─────────────────────────

function buildEmbedFromData(base, fields) {
  const errors = [];
  const embed = new EmbedBuilder();
  let totalLength = 0;

  if (base.title) {
    if (base.title.length > LIMITS.title) errors.push(`Title exceeds ${LIMITS.title} characters.`);
    embed.setTitle(base.title);
    totalLength += base.title.length;
  }
  if (base.description) {
    if (base.description.length > LIMITS.description) errors.push(`Description exceeds ${LIMITS.description} characters.`);
    embed.setDescription(base.description);
    totalLength += base.description.length;
  }
  if (base.url) {
    if (!isValidUrl(base.url)) errors.push('Embed URL is not a valid http(s) URL.');
    else embed.setURL(base.url);
  }
  if (base.color !== null && base.color !== undefined) {
    if (Number.isNaN(base.color)) errors.push('Color is not a valid hex code or color name.');
    else embed.setColor(base.color);
  }
  if (base.authorName) {
    if (base.authorName.length > LIMITS.authorName) errors.push(`Author name exceeds ${LIMITS.authorName} characters.`);
    if (base.authorIconUrl && !isValidUrl(base.authorIconUrl)) errors.push('Author icon URL is invalid.');
    if (base.authorUrl && !isValidUrl(base.authorUrl)) errors.push('Author URL is invalid.');
    embed.setAuthor({
      name: base.authorName,
      iconURL: base.authorIconUrl && isValidUrl(base.authorIconUrl) ? base.authorIconUrl : undefined,
      url: base.authorUrl && isValidUrl(base.authorUrl) ? base.authorUrl : undefined,
    });
    totalLength += base.authorName.length;
  }
  if (base.footerText) {
    if (base.footerText.length > LIMITS.footerText) errors.push(`Footer text exceeds ${LIMITS.footerText} characters.`);
    if (base.footerIconUrl && !isValidUrl(base.footerIconUrl)) errors.push('Footer icon URL is invalid.');
    embed.setFooter({
      text: base.footerText,
      iconURL: base.footerIconUrl && isValidUrl(base.footerIconUrl) ? base.footerIconUrl : undefined,
    });
    totalLength += base.footerText.length;
  }
  if (base.thumbnailUrl) {
    if (!isValidUrl(base.thumbnailUrl)) errors.push('Thumbnail URL is invalid.');
    else embed.setThumbnail(base.thumbnailUrl);
  }
  if (base.imageUrl) {
    if (!isValidUrl(base.imageUrl)) errors.push('Image URL is invalid.');
    else embed.setImage(base.imageUrl);
  }
  if (base.timestamp) embed.setTimestamp();

  if (fields.length > MAX_FIELDS_PER_EMBED) errors.push(`Too many fields (max ${MAX_FIELDS_PER_EMBED}).`);
  for (const field of fields) {
    if (field.name.length > LIMITS.fieldName) errors.push(`Field "${field.name.slice(0, 20)}" name exceeds ${LIMITS.fieldName} characters.`);
    if (field.value.length > LIMITS.fieldValue) errors.push(`Field "${field.name.slice(0, 20)}" value exceeds ${LIMITS.fieldValue} characters.`);
    totalLength += field.name.length + field.value.length;
  }
  if (fields.length > 0) embed.addFields(fields.slice(0, MAX_FIELDS_PER_EMBED));

  if (totalLength > LIMITS.total) errors.push(`Total embed content exceeds Discord's ${LIMITS.total} character limit.`);

  const isEmpty = !base.title && !base.description && !base.authorName && !base.footerText && !base.thumbnailUrl && !base.imageUrl && fields.length === 0;
  if (isEmpty) errors.push('An embed needs at least one of: title, description, author, footer, image, thumbnail, or a field.');

  return { embed, errors };
}

/** Builds every embed in the session, prefixing errors with which embed they belong to. */
function buildAllEmbeds(session) {
  const embeds = [];
  const errors = [];
  session.embeds.forEach((e, i) => {
    const { embed, errors: embedErrors } = buildEmbedFromData(e.base, e.fields);
    embeds.push(embed);
    embedErrors.forEach((err) => errors.push(`Embed ${i + 1}: ${err}`));
  });
  if (embeds.length > MAX_EMBEDS) errors.push(`Too many embeds (max ${MAX_EMBEDS}).`);
  return { embeds: embeds.slice(0, MAX_EMBEDS), errors };
}

// ───────────────────────────── Component build/validate ─────────────────────

function validateButtonInput({ label, styleRaw, target, emojiRaw, disabledRaw }) {
  if (!label || label.length > 80) return 'Button label is required and must be 80 characters or fewer.';

  const styleMap = {
    primary: ButtonStyle.Primary, blurple: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary, grey: ButtonStyle.Secondary, gray: ButtonStyle.Secondary,
    success: ButtonStyle.Success, green: ButtonStyle.Success,
    danger: ButtonStyle.Danger, red: ButtonStyle.Danger,
    link: ButtonStyle.Link, url: ButtonStyle.Link,
  };
  const style = styleMap[(styleRaw || '').trim().toLowerCase()];
  if (!style) return 'Button style must be one of: Primary, Secondary, Success, Danger, or Link.';

  const result = { label, style, disabled: parseBool(disabledRaw, false) };

  if (style === ButtonStyle.Link) {
    if (!isValidUrl(target)) return 'Link buttons require a valid http(s) URL.';
    result.url = target;
  } else {
    if (!target || target.trim().length === 0) return 'Non-link buttons require a custom ID.';
    result.customId = `embed_userbtn:${target.trim().slice(0, 90)}`;
  }

  if (emojiRaw && emojiRaw.trim()) {
    const parsed = parseEmoji(emojiRaw.trim());
    result.emoji = parsed?.id ? { id: parsed.id, name: parsed.name, animated: parsed.animated } : emojiRaw.trim();
  }

  return result;
}

/** Parses "Label | value | description | emoji" lines into select options. */
function parseSelectOptions(raw) {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: 'Provide at least one option, one per line.' };
  if (lines.length > 25) return { error: 'A select menu can have at most 25 options.' };

  const options = [];
  for (const line of lines) {
    const parts = line.split('|').map((p) => p.trim());
    const [label, value, description, emojiRaw] = parts;
    if (!label || !value) return { error: `Invalid option line (need "Label | value"): "${line}"` };
    const opt = { label: label.slice(0, 100), value: value.slice(0, 100) };
    if (description) opt.description = description.slice(0, 100);
    if (emojiRaw) {
      const parsed = parseEmoji(emojiRaw);
      opt.emoji = parsed?.id ? { id: parsed.id, name: parsed.name, animated: parsed.animated } : emojiRaw;
    }
    options.push(opt);
  }
  return { options };
}

function validateSelectInput({ customId, placeholder, optionsRaw, minRaw, maxRaw }) {
  if (!customId || !customId.trim()) return 'Custom ID is required.';
  const { options, error } = parseSelectOptions(optionsRaw);
  if (error) return error;

  const min = minRaw && minRaw.trim() ? parseInt(minRaw, 10) : 1;
  const max = maxRaw && maxRaw.trim() ? parseInt(maxRaw, 10) : 1;
  if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < 1 || min > max || max > options.length) {
    return 'Min/max values must be numbers with 0 ≤ min ≤ max ≤ number of options.';
  }

  return {
    customId: `embed_userselect:${customId.trim().slice(0, 80)}`,
    placeholder: placeholder?.trim().slice(0, 150) || undefined,
    minValues: min,
    maxValues: max,
    options,
  };
}

/** Builds real ActionRows from session.rows. `disableAll` is used for read-only previews. */
function buildRows(rows, { disableAll = false } = {}) {
  return rows.map((row) => {
    const actionRow = new ActionRowBuilder();
    if (row.type === 'buttons') {
      for (const btn of row.buttons) {
        const b = new ButtonBuilder().setLabel(btn.label).setStyle(btn.style).setDisabled(disableAll || btn.disabled);
        if (btn.style === ButtonStyle.Link) b.setURL(btn.url);
        else b.setCustomId(btn.customId);
        if (btn.emoji) b.setEmoji(btn.emoji);
        actionRow.addComponents(b);
      }
    } else if (row.type === 'select') {
      const s = new StringSelectMenuBuilder()
        .setCustomId(row.select.customId)
        .setMinValues(row.select.minValues)
        .setMaxValues(row.select.maxValues)
        .setDisabled(disableAll)
        .addOptions(row.select.options);
      if (row.select.placeholder) s.setPlaceholder(row.select.placeholder);
      actionRow.addComponents(s);
    }
    return actionRow;
  });
}

function rowsSummary(rows) {
  if (!rows.length) return '_No buttons or select menus yet._';
  return rows
    .map((row, i) => {
      if (row.type === 'buttons') return `Row ${i + 1}: ${row.buttons.length} button(s) — ${row.buttons.map((b) => b.label).join(', ')}`;
      return `Row ${i + 1}: select menu "${row.select.placeholder || row.select.customId}" (${row.select.options.length} option(s))`;
    })
    .join('\n');
}

// ───────────────────────────── JSON import/export ───────────────────────────

/** Converts one Discord API embed object (snake_case, as exported by Discohook etc.) into our shape. */
function fromApiEmbedJson(raw) {
  const e = newEmptyEmbed();
  e.base.title = raw.title ?? null;
  e.base.description = raw.description ?? null;
  e.base.url = raw.url ?? null;
  e.base.color = typeof raw.color === 'number' ? raw.color : null;
  if (raw.author) {
    e.base.authorName = raw.author.name ?? null;
    e.base.authorIconUrl = raw.author.icon_url ?? raw.author.iconURL ?? null;
    e.base.authorUrl = raw.author.url ?? null;
  }
  if (raw.footer) {
    e.base.footerText = raw.footer.text ?? null;
    e.base.footerIconUrl = raw.footer.icon_url ?? raw.footer.iconURL ?? null;
  }
  e.base.thumbnailUrl = raw.thumbnail?.url ?? null;
  e.base.imageUrl = raw.image?.url ?? null;
  e.base.timestamp = Boolean(raw.timestamp);
  if (Array.isArray(raw.fields)) {
    e.fields = raw.fields.slice(0, MAX_FIELDS_PER_EMBED).map((f) => ({
      name: String(f.name ?? '').slice(0, LIMITS.fieldName),
      value: String(f.value ?? '').slice(0, LIMITS.fieldValue),
      inline: Boolean(f.inline),
    }));
  }
  return e;
}

/** Converts raw API action rows (snake_case, type 1 containing type 2/3 components) into session.rows. */
function fromApiComponentsJson(raw) {
  if (!Array.isArray(raw)) return [];
  const rows = [];
  for (const row of raw.slice(0, MAX_ROWS)) {
    const comps = row.components || [];
    if (!comps.length) continue;
    if (comps[0].type === 2) {
      rows.push({
        type: 'buttons',
        buttons: comps.slice(0, MAX_BUTTONS_PER_ROW).map((c) => ({
          label: c.label || 'Button',
          style: c.style || ButtonStyle.Secondary,
          url: c.url ?? undefined,
          customId: c.custom_id ?? undefined,
          emoji: c.emoji ?? undefined,
          disabled: Boolean(c.disabled),
        })),
      });
    } else if (comps[0].type === 3) {
      const c = comps[0];
      rows.push({
        type: 'select',
        select: {
          customId: c.custom_id,
          placeholder: c.placeholder ?? undefined,
          minValues: c.min_values ?? 1,
          maxValues: c.max_values ?? 1,
          options: (c.options || []).slice(0, 25),
        },
      });
    }
  }
  return rows;
}

/** Converts discord.js's already-parsed (camelCase) Message#components into session.rows. */
function fromParsedComponentRows(messageComponents) {
  if (!messageComponents?.length) return [];
  const rows = [];
  for (const row of messageComponents.slice(0, MAX_ROWS)) {
    const comps = row.components || [];
    if (!comps.length) continue;
    if (comps[0].type === 2) {
      rows.push({
        type: 'buttons',
        buttons: comps.slice(0, MAX_BUTTONS_PER_ROW).map((c) => ({
          label: c.label || 'Button',
          style: c.style,
          url: c.url ?? undefined,
          customId: c.customId ?? undefined,
          emoji: c.emoji ? { id: c.emoji.id, name: c.emoji.name, animated: c.emoji.animated } : undefined,
          disabled: Boolean(c.disabled),
        })),
      });
    } else if (comps[0].type === 3) {
      const c = comps[0];
      rows.push({
        type: 'select',
        select: {
          customId: c.customId,
          placeholder: c.placeholder ?? undefined,
          minValues: c.minValues ?? 1,
          maxValues: c.maxValues ?? 1,
          options: (c.options || []).map((o) => ({ label: o.label, value: o.value, description: o.description, emoji: o.emoji, default: o.default })),
        },
      });
    }
  }
  return rows;
}

/** Parses a message link or raw ID into { channelId, messageId }. */
function parseMessageRef(input, fallbackChannelId) {
  const linkMatch = input.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (linkMatch) return { channelId: linkMatch[2], messageId: linkMatch[3] };
  if (/^\d{17,20}$/.test(input.trim())) return { channelId: fallbackChannelId, messageId: input.trim() };
  return null;
}

// ───────────────────────────── Panel rendering ──────────────────────────────

function buildControlRows(session) {
  const e = session.embeds.length;
  const idx = session.currentEmbedIndex;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_addembed:${session.id}`).setLabel(`+ Embed (${e}/${MAX_EMBEDS})`).setStyle(ButtonStyle.Secondary).setDisabled(e >= MAX_EMBEDS),
    new ButtonBuilder().setCustomId(`embed_rmembed:${session.id}`).setLabel('− Embed').setStyle(ButtonStyle.Secondary).setDisabled(e <= 1),
    new ButtonBuilder().setCustomId(`embed_prevembed:${session.id}`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(idx <= 0),
    new ButtonBuilder().setCustomId(`embed_nextembed:${session.id}`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(idx >= e - 1),
    new ButtonBuilder().setCustomId(`embed_preview:${session.id}`).setLabel('👁 Preview Final').setStyle(ButtonStyle.Primary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_edittext:${session.id}`).setLabel('Edit Text').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`embed_editauthor:${session.id}`).setLabel('Edit Author').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`embed_editfooter:${session.id}`).setLabel('Edit Footer/Images').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`embed_addfield:${session.id}`).setLabel(`+ Field (${session.embeds[idx].fields.length}/${MAX_FIELDS_PER_EMBED})`).setStyle(ButtonStyle.Secondary).setDisabled(session.embeds[idx].fields.length >= MAX_FIELDS_PER_EMBED),
    new ButtonBuilder().setCustomId(`embed_rmfield:${session.id}`).setLabel('− Last Field').setStyle(ButtonStyle.Secondary).setDisabled(session.embeds[idx].fields.length === 0)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_addbtn:${session.id}`).setLabel('+ Button').setStyle(ButtonStyle.Secondary).setDisabled(session.rows.length >= MAX_ROWS && session.rows[session.rows.length - 1]?.buttons?.length >= MAX_BUTTONS_PER_ROW),
    new ButtonBuilder().setCustomId(`embed_addselect:${session.id}`).setLabel('+ Select Menu').setStyle(ButtonStyle.Secondary).setDisabled(session.rows.length >= MAX_ROWS),
    new ButtonBuilder().setCustomId(`embed_rmcomponent:${session.id}`).setLabel('− Last Component').setStyle(ButtonStyle.Secondary).setDisabled(session.rows.length === 0)
  );

  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_importjson:${session.id}`).setLabel('Import JSON').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`embed_exportjson:${session.id}`).setLabel('Export JSON').setStyle(ButtonStyle.Secondary)
  );

  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`embed_send:${session.id}`).setLabel(session.sourceMessage ? 'Save (Edit Original)' : 'Send').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`embed_cancel:${session.id}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
  );

  return [row1, row2, row3, row4, row5];
}

function renderPanel(session) {
  const { embeds, errors } = buildAllEmbeds(session);
  const header = [
    `**Editing embed ${session.currentEmbedIndex + 1} of ${session.embeds.length}** — target channel <#${session.targetChannelId}>`,
    session.sourceMessage ? '_Loaded from an existing message — Send will edit it in place._' : null,
    '',
    '**Buttons / Select Menus:**',
    rowsSummary(session.rows),
  ].filter((l) => l !== null);

  const content = errors.length
    ? `${header.join('\n')}\n\n⚠️ **Fix before sending:**\n${errors.map((e) => `• ${e}`).join('\n')}`
    : `${header.join('\n')}\n\n✅ All embeds look valid.`;

  return { content, embeds, components: buildControlRows(session) };
}

/** Logs a successful send/edit to the configured log channel, mirroring the say.js log style. */
async function logUsage(interaction, { action, embeds, rows, targetChannelId }) {
  const logChannel = await interaction.client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
  if (!logChannel) return;

  const payload = { embeds: embeds.map((e) => e.toJSON()), components: rows.map((r) => r.toJSON()) };
  const file = new AttachmentBuilder(Buffer.from(JSON.stringify(payload, null, 2)), { name: 'embed.json' });

  const logEmbed = new EmbedBuilder()
    .setTitle('/embed Used')
    .setColor(0x5865f2)
    .addFields(
      { name: 'Executor', value: `<@${interaction.user.id}> (${interaction.user.tag ?? interaction.user.username} — \`${interaction.user.id}\`)`, inline: false },
      { name: 'Action', value: action, inline: true },
      { name: 'Target Channel', value: `<#${targetChannelId}> (\`${targetChannelId}\`)`, inline: true },
      { name: 'Server', value: interaction.guild ? `${interaction.guild.name} (\`${interaction.guild.id}\`)` : `\`${interaction.guildId}\``, inline: false },
      { name: 'Embeds / Component Rows', value: `${embeds.length} embed(s), ${rows.length} row(s)`, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: 'DHS Bot • Embed Log' });

  await logChannel.send({ embeds: [logEmbed], files: [file] }).catch(() => null);
}

function scheduleExpiry(session) {
  clearTimeout(session.timeout);
  session.timeout = setTimeout(async () => {
    sessions.delete(session.id);
    await session.commandInteraction
      .editReply({ content: '⌛ This embed builder session expired. Run `/embed` again to start over.', embeds: [], components: [] })
      .catch(() => null);
  }, SESSION_TTL_MS);
}

function ownerCheck(interaction, session) {
  return session && interaction.user.id === session.ownerId;
}

function notYoursReply(interaction) {
  return interaction.reply({ content: '❌ Only the person who ran `/embed` can use these controls.', flags: MessageFlags.Ephemeral });
}

// ───────────────────────────── Slash command data ───────────────────────────

export const data = new SlashCommandBuilder()
  .setName('embed')
  .setDescription('Build and send a professional embed to a channel.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addStringOption((o) => o.setName('title').setDescription('Embed title').setMaxLength(256))
  .addStringOption((o) => o.setName('description').setDescription('Embed description (Markdown supported)').setMaxLength(4096))
  .addChannelOption((o) =>
    o.setName('channel').setDescription('Channel to send to (defaults to this channel)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  )
  .addStringOption((o) => o.setName('color').setDescription('Hex code (e.g. #5865F2) or color name (e.g. Blurple)'))
  .addStringOption((o) => o.setName('url').setDescription('URL the embed title links to'))
  .addStringOption((o) => o.setName('author_name').setDescription('Author name').setMaxLength(256))
  .addStringOption((o) => o.setName('author_icon_url').setDescription('Author icon URL'))
  .addStringOption((o) => o.setName('author_url').setDescription('URL the author name links to'))
  .addStringOption((o) => o.setName('footer_text').setDescription('Footer text').setMaxLength(2048))
  .addStringOption((o) => o.setName('footer_icon_url').setDescription('Footer icon URL'))
  .addStringOption((o) => o.setName('thumbnail_url').setDescription('Small image in the top-right corner'))
  .addStringOption((o) => o.setName('image_url').setDescription('Large image at the bottom of the embed'))
  .addBooleanOption((o) => o.setName('timestamp').setDescription('Add the current timestamp to the embed'))
  .addStringOption((o) =>
    o.setName('source_message').setDescription('Message link or ID to load/edit — overrides the text options above')
  )
  .addBooleanOption((o) => o.setName('preview').setDescription('Preview and fine-tune before sending — default: true'))
  .addBooleanOption((o) => o.setName('ephemeral').setDescription('Make the confirmation reply visible only to you — default: true'));

// ───────────────────────────── Execute ──────────────────────────────────────

export async function execute(interaction) {
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;
  const preview = interaction.options.getBoolean('preview') ?? true;
  const sourceMessageInput = interaction.options.getString('source_message');

  const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;
  if (!targetChannel?.isTextBased?.() || targetChannel.isDMBased?.()) {
    return interaction.reply({ content: '❌ Please choose a valid server text channel.', flags: MessageFlags.Ephemeral });
  }
  const botPerms = targetChannel.permissionsFor(interaction.client.user);
  if (!botPerms?.has(PermissionFlagsBits.ViewChannel) || !botPerms.has(PermissionFlagsBits.SendMessages) || !botPerms.has(PermissionFlagsBits.EmbedLinks)) {
    return interaction.reply({ content: `❌ I need **View Channel**, **Send Messages**, and **Embed Links** permissions in <#${targetChannel.id}>.`, flags: MessageFlags.Ephemeral });
  }

  let embeds = [];
  let rows = [];
  let sourceMessage = null;

  // ── Load from an existing message, if requested ──
  if (sourceMessageInput) {
    const ref = parseMessageRef(sourceMessageInput, targetChannel.id);
    if (!ref) {
      return interaction.reply({ content: '❌ `source_message` must be a message link or a raw message ID.', flags: MessageFlags.Ephemeral });
    }
    const refChannel = await interaction.client.channels.fetch(ref.channelId).catch(() => null);
    const message = refChannel ? await refChannel.messages.fetch(ref.messageId).catch(() => null) : null;
    if (!message) {
      return interaction.reply({ content: '❌ Could not find that message (check the link/ID and my access to that channel).', flags: MessageFlags.Ephemeral });
    }

    embeds = message.embeds.length ? message.embeds.map((e) => fromApiEmbedJson(e.toJSON())) : [newEmptyEmbed()];
    rows = fromParsedComponentRows(message.components);
    if (message.author.id === interaction.client.user.id) {
      sourceMessage = { channelId: message.channelId, messageId: message.id };
    }
  } else {
    // ── Otherwise, start from the slash command's base options ──
    const base = {
      title: interaction.options.getString('title'),
      description: interaction.options.getString('description'),
      url: interaction.options.getString('url'),
      color: resolveColor(interaction.options.getString('color')),
      authorName: interaction.options.getString('author_name'),
      authorIconUrl: interaction.options.getString('author_icon_url'),
      authorUrl: interaction.options.getString('author_url'),
      footerText: interaction.options.getString('footer_text'),
      footerIconUrl: interaction.options.getString('footer_icon_url'),
      thumbnailUrl: interaction.options.getString('thumbnail_url'),
      imageUrl: interaction.options.getString('image_url'),
      timestamp: interaction.options.getBoolean('timestamp') ?? false,
    };
    embeds = [{ base, fields: [] }];
  }

  // ── Direct send path (no interactive panel) — only valid for a fresh, single embed ──
  if (!preview && !sourceMessageInput) {
    const { embed, errors } = buildEmbedFromData(embeds[0].base, []);
    if (errors.length) {
      return interaction.reply({ content: `❌ **Could not build embed:**\n${errors.map((e) => `• ${e}`).join('\n')}`, flags: MessageFlags.Ephemeral });
    }
    try {
      await targetChannel.send({ embeds: [embed] });
      await logUsage(interaction, { action: 'Direct Send', embeds: [embed], rows: [], targetChannelId: targetChannel.id });
      return interaction.reply({ content: `✅ Embed sent to <#${targetChannel.id}>.`, flags: ephemeral ? MessageFlags.Ephemeral : undefined });
    } catch (err) {
      console.error('[embed] send failed:', err);
      return interaction.reply({ content: '❌ Failed to send the embed. Check my permissions and try again.', flags: MessageFlags.Ephemeral });
    }
  }

  // ── Interactive builder panel ──
  const sessionId = `${interaction.user.id}-${interaction.id}`;
  const session = {
    id: sessionId,
    ownerId: interaction.user.id,
    guildId: interaction.guildId,
    targetChannelId: targetChannel.id,
    embeds,
    currentEmbedIndex: 0,
    rows,
    sourceMessage,
    commandInteraction: interaction,
    timeout: null,
  };
  sessions.set(sessionId, session);
  scheduleExpiry(session);

  await interaction.reply({ ...renderPanel(session), flags: MessageFlags.Ephemeral });
}

// ───────────────────────────── Button handlers ──────────────────────────────

function getSession(interaction) {
  return sessions.get(interaction.customId.split(':')[1]);
}

async function handleAddEmbed(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  if (session.embeds.length >= MAX_EMBEDS) return interaction.reply({ content: `❌ Max ${MAX_EMBEDS} embeds.`, flags: MessageFlags.Ephemeral });
  session.embeds.push(newEmptyEmbed());
  session.currentEmbedIndex = session.embeds.length - 1;
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handleRemoveEmbed(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  if (session.embeds.length <= 1) return interaction.reply({ content: '❌ You need at least one embed.', flags: MessageFlags.Ephemeral });
  session.embeds.splice(session.currentEmbedIndex, 1);
  session.currentEmbedIndex = Math.max(0, session.currentEmbedIndex - 1);
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handlePrevEmbed(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  session.currentEmbedIndex = Math.max(0, session.currentEmbedIndex - 1);
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handleNextEmbed(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  session.currentEmbedIndex = Math.min(session.embeds.length - 1, session.currentEmbedIndex + 1);
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handlePreview(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const { embeds, errors } = buildAllEmbeds(session);
  const rows = buildRows(session.rows, { disableAll: true });
  await interaction.reply({
    content: errors.length ? `⚠️ Fix errors first — showing best-effort preview.` : 'This is exactly what will be sent (buttons disabled for preview):',
    embeds,
    components: rows,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleAddField(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const modal = new ModalBuilder().setCustomId(`embed_addfield_modal:${session.id}`).setTitle('Add Field');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Field name').setStyle(TextInputStyle.Short).setMaxLength(256).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('Field value (Markdown supported)').setStyle(TextInputStyle.Paragraph).setMaxLength(1024).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inline').setLabel('Inline? (true/false)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('false'))
  );
  await interaction.showModal(modal);
}

async function handleRemoveField(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  session.embeds[session.currentEmbedIndex].fields.pop();
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handleEditText(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const b = session.embeds[session.currentEmbedIndex].base;
  const modal = new ModalBuilder().setCustomId(`embed_edittext_modal:${session.id}`).setTitle(`Edit Text — Embed ${session.currentEmbedIndex + 1}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(256).setValue(b.title || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(4000).setValue(b.description || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('Color (hex or name)').setStyle(TextInputStyle.Short).setRequired(false).setValue(b.color != null ? `#${b.color.toString(16).padStart(6, '0')}` : '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('Title URL').setStyle(TextInputStyle.Short).setRequired(false).setValue(b.url || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('timestamp').setLabel('Timestamp? (true/false)').setStyle(TextInputStyle.Short).setRequired(false).setValue(String(Boolean(b.timestamp))))
  );
  await interaction.showModal(modal);
}

async function handleEditAuthor(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const b = session.embeds[session.currentEmbedIndex].base;
  const modal = new ModalBuilder().setCustomId(`embed_editauthor_modal:${session.id}`).setTitle(`Edit Author — Embed ${session.currentEmbedIndex + 1}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Author name').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(256).setValue(b.authorName || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('icon').setLabel('Author icon URL').setStyle(TextInputStyle.Short).setRequired(false).setValue(b.authorIconUrl || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('Author URL').setStyle(TextInputStyle.Short).setRequired(false).setValue(b.authorUrl || ''))
  );
  await interaction.showModal(modal);
}

async function handleEditFooter(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const b = session.embeds[session.currentEmbedIndex].base;
  const modal = new ModalBuilder().setCustomId(`embed_editfooter_modal:${session.id}`).setTitle(`Edit Footer/Images — Embed ${session.currentEmbedIndex + 1}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Footer text').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2048).setValue(b.footerText || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('icon').setLabel('Footer icon URL').setStyle(TextInputStyle.Short).setRequired(false).setValue(b.footerIconUrl || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('thumbnail').setLabel('Thumbnail URL').setStyle(TextInputStyle.Short).setRequired(false).setValue(b.thumbnailUrl || '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('image').setLabel('Image URL').setStyle(TextInputStyle.Short).setRequired(false).setValue(b.imageUrl || ''))
  );
  await interaction.showModal(modal);
}

async function handleAddButton(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const modal = new ModalBuilder().setCustomId(`embed_addbtn_modal:${session.id}`).setTitle('Add Button');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Button label').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('style').setLabel('Style (Primary/Secondary/Success/Danger/Link)').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('target').setLabel('URL (Link) or Custom ID (others)').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (optional)').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('disabled').setLabel('Disabled? (true/false)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('false'))
  );
  await interaction.showModal(modal);
}

async function handleAddSelect(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  if (session.rows.length >= MAX_ROWS) return interaction.reply({ content: `❌ Max ${MAX_ROWS} rows already reached.`, flags: MessageFlags.Ephemeral });
  const modal = new ModalBuilder().setCustomId(`embed_addselect_modal:${session.id}`).setTitle('Add Select Menu');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('customid').setLabel('Custom ID').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('placeholder').setLabel('Placeholder text (optional)').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('options').setLabel('Options: Label | value | desc | emoji').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Option 1 | opt1\nOption 2 | opt2 | a description')
    ),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('min').setLabel('Min values (default 1)').setStyle(TextInputStyle.Short).setRequired(false)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('max').setLabel('Max values (default 1)').setStyle(TextInputStyle.Short).setRequired(false))
  );
  await interaction.showModal(modal);
}

async function handleRemoveComponent(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const last = session.rows[session.rows.length - 1];
  if (!last) return interaction.update(renderPanel(session));
  if (last.type === 'buttons' && last.buttons.length > 1) last.buttons.pop();
  else session.rows.pop();
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handleImportJson(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const modal = new ModalBuilder().setCustomId(`embed_importjson_modal:${session.id}`).setTitle('Import JSON');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('json')
        .setLabel('Paste embed JSON (single embed or {embeds, components})')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    )
  );
  await interaction.showModal(modal);
}

async function handleExportJson(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const { embeds } = buildAllEmbeds(session);
  const rows = buildRows(session.rows);
  const payload = {
    embeds: embeds.map((e) => e.toJSON()),
    components: rows.map((r) => r.toJSON()),
  };
  const file = new AttachmentBuilder(Buffer.from(JSON.stringify(payload, null, 2)), { name: 'embed.json' });
  await interaction.reply({ content: 'Here\u2019s the raw JSON for this builder session:', files: [file], flags: MessageFlags.Ephemeral });
}

async function handleSend(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);

  const { embeds, errors } = buildAllEmbeds(session);
  const rows = buildRows(session.rows);
  if (errors.length) {
    return interaction.update({ content: `⚠️ **Fix these before sending:**\n${errors.map((e) => `• ${e}`).join('\n')}`, embeds, components: buildControlRows(session) });
  }

  try {
    if (session.sourceMessage) {
      const channel = await interaction.client.channels.fetch(session.sourceMessage.channelId).catch(() => null);
      const message = channel ? await channel.messages.fetch(session.sourceMessage.messageId).catch(() => null) : null;
      if (!message) return interaction.update({ content: '❌ The original message no longer exists.', embeds, components: [] });
      await message.edit({ embeds, components: rows });
      await logUsage(interaction, { action: 'Edit Original', embeds, rows, targetChannelId: message.channelId });
      clearTimeout(session.timeout);
      sessions.delete(session.id);
      await interaction.update({ content: `✅ Message updated in <#${message.channelId}>.`, embeds, components: [] });
    } else {
      const channel = await interaction.client.channels.fetch(session.targetChannelId).catch(() => null);
      if (!channel) return interaction.update({ content: '❌ The target channel no longer exists.', embeds, components: [] });
      await channel.send({ embeds, components: rows });
      await logUsage(interaction, { action: 'Send', embeds, rows, targetChannelId: channel.id });
      clearTimeout(session.timeout);
      sessions.delete(session.id);
      await interaction.update({ content: `✅ Sent to <#${channel.id}>.`, embeds, components: [] });
    }
  } catch (err) {
    console.error('[embed] send/edit failed:', err);
    await interaction.update({ content: '❌ Failed to send/update. Check my permissions and try again.', embeds, components: buildControlRows(session) });
  }
}

async function handleCancel(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  clearTimeout(session.timeout);
  sessions.delete(session.id);
  await interaction.update({ content: '🚫 Embed builder cancelled.', embeds: [], components: [] });
}

// ───────────────────────────── Modal handlers ────────────────────────────────

async function handleAddFieldModal(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const fields = session.embeds[session.currentEmbedIndex].fields;
  if (fields.length >= MAX_FIELDS_PER_EMBED) {
    return interaction.reply({ content: `❌ Max ${MAX_FIELDS_PER_EMBED} fields on this embed.`, flags: MessageFlags.Ephemeral });
  }
  const name = interaction.fields.getTextInputValue('name').trim();
  const value = interaction.fields.getTextInputValue('value').trim();
  const inline = parseBool(interaction.fields.getTextInputValue('inline'), false);
  if (name.length > LIMITS.fieldName || value.length > LIMITS.fieldValue) {
    return interaction.reply({ content: `❌ Name ≤${LIMITS.fieldName} chars, value ≤${LIMITS.fieldValue} chars.`, flags: MessageFlags.Ephemeral });
  }
  fields.push({ name, value, inline });
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handleEditTextModal(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const b = session.embeds[session.currentEmbedIndex].base;
  const title = interaction.fields.getTextInputValue('title').trim();
  const description = interaction.fields.getTextInputValue('description').trim();
  const colorRaw = interaction.fields.getTextInputValue('color').trim();
  const url = interaction.fields.getTextInputValue('url').trim();
  const timestamp = parseBool(interaction.fields.getTextInputValue('timestamp'), false);

  const color = colorRaw ? resolveColor(colorRaw) : null;
  if (colorRaw && color === undefined) {
    return interaction.reply({ content: '❌ That color isn\u2019t a valid hex code or color name.', flags: MessageFlags.Ephemeral });
  }

  b.title = title || null;
  b.description = description || null;
  b.color = color;
  b.url = url || null;
  b.timestamp = timestamp;
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handleEditAuthorModal(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const b = session.embeds[session.currentEmbedIndex].base;
  b.authorName = interaction.fields.getTextInputValue('name').trim() || null;
  b.authorIconUrl = interaction.fields.getTextInputValue('icon').trim() || null;
  b.authorUrl = interaction.fields.getTextInputValue('url').trim() || null;
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handleEditFooterModal(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  const b = session.embeds[session.currentEmbedIndex].base;
  b.footerText = interaction.fields.getTextInputValue('text').trim() || null;
  b.footerIconUrl = interaction.fields.getTextInputValue('icon').trim() || null;
  b.thumbnailUrl = interaction.fields.getTextInputValue('thumbnail').trim() || null;
  b.imageUrl = interaction.fields.getTextInputValue('image').trim() || null;
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handleAddButtonModal(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);

  const label = interaction.fields.getTextInputValue('label').trim();
  const styleRaw = interaction.fields.getTextInputValue('style');
  const target = interaction.fields.getTextInputValue('target').trim();
  const emojiRaw = interaction.fields.getTextInputValue('emoji');
  const disabledRaw = interaction.fields.getTextInputValue('disabled');

  const result = validateButtonInput({ label, styleRaw, target, emojiRaw, disabledRaw });
  if (typeof result === 'string') return interaction.reply({ content: `❌ ${result}`, flags: MessageFlags.Ephemeral });

  let lastRow = session.rows[session.rows.length - 1];
  if (lastRow?.type === 'buttons' && lastRow.buttons.length < MAX_BUTTONS_PER_ROW) {
    lastRow.buttons.push(result);
  } else if (session.rows.length < MAX_ROWS) {
    session.rows.push({ type: 'buttons', buttons: [result] });
  } else {
    return interaction.reply({ content: `❌ Max ${MAX_ROWS} rows reached — remove a component first.`, flags: MessageFlags.Ephemeral });
  }
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handleAddSelectModal(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);
  if (session.rows.length >= MAX_ROWS) {
    return interaction.reply({ content: `❌ Max ${MAX_ROWS} rows reached — remove a component first.`, flags: MessageFlags.Ephemeral });
  }

  const customId = interaction.fields.getTextInputValue('customid');
  const placeholder = interaction.fields.getTextInputValue('placeholder');
  const optionsRaw = interaction.fields.getTextInputValue('options');
  const minRaw = interaction.fields.getTextInputValue('min');
  const maxRaw = interaction.fields.getTextInputValue('max');

  const result = validateSelectInput({ customId, placeholder, optionsRaw, minRaw, maxRaw });
  if (typeof result === 'string') return interaction.reply({ content: `❌ ${result}`, flags: MessageFlags.Ephemeral });

  session.rows.push({ type: 'select', select: result });
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

async function handleImportJsonModal(interaction) {
  const session = getSession(interaction);
  if (!ownerCheck(interaction, session)) return notYoursReply(interaction);

  const raw = interaction.fields.getTextInputValue('json');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return interaction.reply({ content: '❌ That isn\u2019t valid JSON.', flags: MessageFlags.Ephemeral });
  }

  let newEmbeds = [];
  let newRows = [];

  if (Array.isArray(parsed.embeds)) {
    newEmbeds = parsed.embeds.slice(0, MAX_EMBEDS).map(fromApiEmbedJson);
  } else if (parsed.title || parsed.description || parsed.fields || parsed.author || parsed.footer || parsed.image || parsed.thumbnail) {
    newEmbeds = [fromApiEmbedJson(parsed)];
  } else {
    return interaction.reply({ content: '❌ Couldn\u2019t find an embed in that JSON. Expected a single embed object or `{ "embeds": [...] }`.', flags: MessageFlags.Ephemeral });
  }
  if (Array.isArray(parsed.components)) newRows = fromApiComponentsJson(parsed.components);

  session.embeds = newEmbeds.length ? newEmbeds : [newEmptyEmbed()];
  session.currentEmbedIndex = 0;
  session.rows = newRows;
  scheduleExpiry(session);
  await interaction.update(renderPanel(session));
}

// ───────────────────────────── Exports ──────────────────────────────────────
// Registered against interactionCreate's prefix-based router (first
// ':'-delimited segment of the customId), so one set of handlers serves
// every open session.

export const buttons = {
  embed_addembed: handleAddEmbed,
  embed_rmembed: handleRemoveEmbed,
  embed_prevembed: handlePrevEmbed,
  embed_nextembed: handleNextEmbed,
  embed_preview: handlePreview,
  embed_edittext: handleEditText,
  embed_editauthor: handleEditAuthor,
  embed_editfooter: handleEditFooter,
  embed_addfield: handleAddField,
  embed_rmfield: handleRemoveField,
  embed_addbtn: handleAddButton,
  embed_addselect: handleAddSelect,
  embed_rmcomponent: handleRemoveComponent,
  embed_importjson: handleImportJson,
  embed_exportjson: handleExportJson,
  embed_send: handleSend,
  embed_cancel: handleCancel,
};

export const modals = {
  embed_addfield_modal: handleAddFieldModal,
  embed_edittext_modal: handleEditTextModal,
  embed_editauthor_modal: handleEditAuthorModal,
  embed_editfooter_modal: handleEditFooterModal,
  embed_addbtn_modal: handleAddButtonModal,
  embed_addselect_modal: handleAddSelectModal,
  embed_importjson_modal: handleImportJsonModal,
};
