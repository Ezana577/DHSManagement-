import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { STAFF_ROLE, SUBMISSION_CHANNEL, RANKS } from '../appConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../data');
mkdirSync(dataDir, { recursive: true });

const db = new Low(new JSONFile(join(dataDir, 'applications.json')), {
  enabledRanks: [],
  applications: [],
});
await db.read();
db.data = { enabledRanks: [], applications: [], ...db.data };
await db.write();

const save = () => db.write();
const activeSessions = new Set();

const BLACKLIST_ROLE = '1400677455437762615';
const FOOTER = { text: 'Department of Homeland Security • Applications' };
const GOLD  = 0xd4af37;
const RED   = 0xc0392b;
const GREEN = 0x2ecc71;
const DARK  = 0x2c2f33;
const BLACK = 0x1a1a1a;

const rankQuestions = Object.fromEntries(RANKS.map((r) => [r.id, r.questions]));
const rankNames     = Object.fromEntries(RANKS.map((r) => [r.id, r.name]));
const allRankIds    = RANKS.map((r) => r.id);

const BLACKLIST_PRESETS = [
  'You have been blacklisted due to using an artificial intelligence on this application. If you wish to appeal, please open a support ticket.',
  'You have been blacklisted due to trolling. If you wish to appeal, please open a support ticket.',
];

const SELECT_PAGE_SIZE = 25;

function errEmbed(description) {
  return new EmbedBuilder()
    .setColor(RED)
    .setAuthor({ name: 'DHS Application System' })
    .setDescription(`> ${description}`)
    .setTimestamp()
    .setFooter(FOOTER);
}

function getEnabledRanks() {
  return db.data.enabledRanks.filter((r) => r.enabled);
}

function getAnyActiveApp(userId) {
  return db.data.applications.find((a) => a.userId === userId && a.status === 'pending');
}

function getAppById(id) {
  return db.data.applications.find((a) => a.id === id);
}

function isRankEnabled(rankId) {
  return db.data.enabledRanks.some((r) => r.id === rankId && r.enabled);
}

function isBlacklisted(member) {
  return member.roles.cache.has(BLACKLIST_ROLE);
}

function actionButtons(appId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`appreview:${appId}`).setLabel('Review').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`appaccept:${appId}`).setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`appdeny:${appId}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`appblacklist:${appId}`).setLabel('Blacklist').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  );
}

function submissionEmbed(app) {
  const color = app.status === 'accepted' ? GREEN : app.status === 'denied' ? RED : app.status === 'blacklisted' ? BLACK : GOLD;
  const statusLabel = app.status.charAt(0).toUpperCase() + app.status.slice(1);
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: 'DHS Application System' })
    .setTitle(`Application for ${rankNames[app.rankId] || 'Unknown Rank'}`)
    .setThumbnail(app.avatarURL)
    .setDescription(`<@${app.userId}> has submitted an application.`)
    .addFields(
      { name: 'User',         value: `<@${app.userId}>`, inline: true },
      { name: 'Role Applied', value: rankNames[app.rankId] || 'Unknown', inline: true },
      { name: 'Submitted',    value: `<t:${Math.floor(new Date(app.createdAt).getTime() / 1000)}:F>`, inline: false },
      { name: 'Status',       value: statusLabel, inline: true }
    )
    .setTimestamp()
    .setFooter(FOOTER);

  if (app.reason) {
    embed.addFields({ name: 'Reason', value: `\`\`\`${app.reason}\`\`\``, inline: false });
  }

  return embed;
}

function buildSummaryEmbed(questions, answers) {
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: 'DHS Application System' })
    .setTitle('Application Summary')
    .setDescription('Review your responses below. You may edit any answer before submitting.')
    .setTimestamp()
    .setFooter(FOOTER);

  for (const q of questions) {
    const ans = answers.find((a) => a.questionId === q.id);
    embed.addFields({ name: q.prompt.slice(0, 256), value: (ans?.value || '_No response_').slice(0, 1024), inline: false });
  }

  return embed;
}

// Builds summary components, paginating the edit select if questions > 25.
// page is 0-indexed.
function buildSummaryComponents(questions, page = 0) {
  const totalPages = Math.ceil(questions.length / SELECT_PAGE_SIZE);
  const pageQuestions = questions.slice(page * SELECT_PAGE_SIZE, (page + 1) * SELECT_PAGE_SIZE);

  const editSelect = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`app:edit_select:${page}`)
      .setPlaceholder(
        totalPages > 1
          ? `Edit a question (page ${page + 1}/${totalPages})...`
          : 'Select a question to edit...'
      )
      .addOptions(
        pageQuestions.map((q, i) => {
          const globalIdx = page * SELECT_PAGE_SIZE + i;
          return {
            label: `Question ${globalIdx + 1}`,
            description: q.prompt.slice(0, 50),
            value: q.id,
          };
        })
      )
  );

  const submitRowButtons = [
    new ButtonBuilder()
      .setCustomId('app:submit')
      .setLabel('Submit Application')
      .setStyle(ButtonStyle.Success),
  ];

  // Add prev/next page buttons when there are multiple pages
  if (totalPages > 1) {
    if (page > 0) {
      submitRowButtons.unshift(
        new ButtonBuilder()
          .setCustomId(`app:editpage:${page - 1}`)
          .setLabel('◀ Prev Questions')
          .setStyle(ButtonStyle.Secondary)
      );
    }
    if (page < totalPages - 1) {
      submitRowButtons.push(
        new ButtonBuilder()
          .setCustomId(`app:editpage:${page + 1}`)
          .setLabel('Next Questions ▶')
          .setStyle(ButtonStyle.Secondary)
      );
    }
  }

  const submitRow = new ActionRowBuilder().addComponents(submitRowButtons);

  return [editSelect, submitRow];
}

async function autoDenyBlacklistedApps(client, userId) {
  const pending = db.data.applications.filter((a) => a.userId === userId && a.status === 'pending');
  for (const app of pending) {
    app.status = 'denied';
    app.reason = 'This application was automatically denied because the applicant has been blacklisted.';
    app.reviewedBy = client.user.id;
  }
  if (pending.length > 0) await save();

  for (const app of pending) {
    try {
      const channel = await client.channels.fetch(SUBMISSION_CHANNEL).catch(() => null);
      if (!channel) continue;
      if (app.messageId) {
        const msg = await channel.messages.fetch(app.messageId).catch(() => null);
        if (msg) await msg.edit({ embeds: [submissionEmbed(app)], components: [actionButtons(app.id, true)] }).catch(() => null);
      }
    } catch {}
  }
}

async function runDmFlow(user, rankId, onComplete) {
  const questions = rankQuestions[rankId];
  const rankName  = rankNames[rankId];

  let dm;
  try { dm = await user.createDM(); }
  catch { return { success: false, reason: 'dm_failed' }; }

  activeSessions.add(user.id);

  if (!questions?.length) {
    await dm.send({ embeds: [errEmbed('This application is not currently set up. Please contact staff.')] }).catch(() => null);
    activeSessions.delete(user.id);
    return { success: false, reason: 'no_questions' };
  }

  const answers = [];

  for (let i = 0; i < questions.length; i++) {
    if (!isRankEnabled(rankId)) {
      await dm.send({ embeds: [errEmbed(`The application for ${rankName} has been disabled. If you believe this is a mistake, please open a ticket.`)] }).catch(() => null);
      activeSessions.delete(user.id);
      return { success: false, reason: 'disabled' };
    }

    const q = questions[i];
    const isChoice = q.type === 'choice';

    const qEmbed = new EmbedBuilder()
      .setColor(GOLD)
      .setAuthor({ name: 'DHS Application System' })
      .setTitle(`Question ${i + 1} of ${questions.length}`)
      .setDescription(q.prompt)
      .setFooter({ text: `${FOOTER.text} — ${isChoice ? 'Select an option below' : 'Type your answer below'}` });

    if (isChoice) {
      const row = new ActionRowBuilder().addComponents(
        q.choices.slice(0, 5).map((label, idx) =>
          new ButtonBuilder().setCustomId(`dmq:${idx}`).setLabel(label).setStyle(ButtonStyle.Secondary)
        )
      );

      const msg = await dm.send({ embeds: [qEmbed], components: [row] }).catch(() => null);
      if (!msg) { activeSessions.delete(user.id); return { success: false, reason: 'dm_failed' }; }

      try {
        const btn = await msg.awaitMessageComponent({
          filter: (b) => b.user.id === user.id,
          componentType: ComponentType.Button,
          time: 300_000,
        });
        const idx = parseInt(btn.customId.split(':')[1]);
        answers.push({ questionId: q.id, value: q.choices[idx] });
        await btn.update({
          components: [new ActionRowBuilder().addComponents(
            q.choices.slice(0, 5).map((label, j) =>
              new ButtonBuilder().setCustomId(`dmq:${j}`).setLabel(label)
                .setStyle(j === idx ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(true)
            )
          )],
        });
      } catch {
        await dm.send({ embeds: [errEmbed('Your application timed out. Please restart.')] }).catch(() => null);
        activeSessions.delete(user.id);
        return { success: false, reason: 'timeout' };
      }

    } else {
      await dm.send({ embeds: [qEmbed] }).catch(() => null);
      try {
        const collected = await dm.awaitMessages({
          filter: (m) => m.author.id === user.id,
          max: 1, time: 300_000, errors: ['time'],
        });
        answers.push({ questionId: q.id, value: collected.first().content.trim() });
      } catch {
        await dm.send({ embeds: [errEmbed('Your application timed out. Please restart.')] }).catch(() => null);
        activeSessions.delete(user.id);
        return { success: false, reason: 'timeout' };
      }
    }
  }

  if (!isRankEnabled(rankId)) {
    await dm.send({ embeds: [errEmbed(`The application for ${rankName} has been disabled. If you believe this is a mistake, please open a ticket.`)] }).catch(() => null);
    activeSessions.delete(user.id);
    return { success: false, reason: 'disabled' };
  }

  const summaryMsg = await dm.send({
    embeds: [buildSummaryEmbed(questions, answers)],
    components: buildSummaryComponents(questions, 0),
  }).catch(() => null);

  if (!summaryMsg) { activeSessions.delete(user.id); return { success: false, reason: 'dm_failed' }; }

  const sessionAnswers = [...answers];

  const collector = summaryMsg.createMessageComponentCollector({
    filter: (i) => i.user.id === user.id,
    time: 600_000,
  });

  return new Promise((resolve) => {
    collector.on('collect', async (i) => {

      // ── Submit ──────────────────────────────────────────────
      if (i.customId === 'app:submit') {
        collector.stop('submitted');

        await i.update({ embeds: [buildSummaryEmbed(questions, sessionAnswers)], components: [] });

        const app = {
          id: randomUUID(),
          userId: user.id,
          rankId,
          username: user.tag,
          avatarURL: user.displayAvatarURL({ dynamic: true }),
          answers: sessionAnswers,
          status: 'pending',
          createdAt: new Date().toISOString(),
          reviewedBy: null,
          messageId: null,
          reason: null,
        };

        db.data.applications.push(app);
        await save();

        activeSessions.delete(user.id);
        await onComplete(app);
        resolve({ success: true, app });
        return;
      }

      // ── Page navigation ─────────────────────────────────────
      if (i.customId.startsWith('app:editpage:')) {
        const newPage = parseInt(i.customId.split(':')[2]);
        await i.update({
          embeds: [buildSummaryEmbed(questions, sessionAnswers)],
          components: buildSummaryComponents(questions, newPage),
        });
        return;
      }

      // ── Edit select (customId = app:edit_select:<page>) ─────
      if (i.customId.startsWith('app:edit_select:')) {
        const currentPage = parseInt(i.customId.split(':')[2]);
        const questionId = i.values[0];
        const q = questions.find((q) => q.id === questionId);

        await i.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(GOLD)
              .setAuthor({ name: 'DHS Application System' })
              .setTitle('Edit Response')
              .setDescription(`**${q.prompt}**\n\nType your new answer below.`)
              .setFooter(FOOTER),
          ],
        });

        try {
          const collected = await dm.awaitMessages({
            filter: (m) => m.author.id === user.id,
            max: 1, time: 300_000, errors: ['time'],
          });
          const existing = sessionAnswers.find((a) => a.questionId === questionId);
          if (existing) existing.value = collected.first().content.trim();
          await summaryMsg.edit({
            embeds: [buildSummaryEmbed(questions, sessionAnswers)],
            components: buildSummaryComponents(questions, currentPage),
          });
        } catch {
          await dm.send({ embeds: [errEmbed('Edit timed out. Your previous answer was kept.')] }).catch(() => null);
        }
        return;
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'submitted') {
        activeSessions.delete(user.id);
        dm.send({ embeds: [errEmbed('Your application session has expired. Please restart.')] }).catch(() => null);
        resolve({ success: false, reason: 'timeout' });
      }
    });
  });
}

// ── /application ──────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('application')
  .setDescription('Send the application dashboard.');

export async function execute(interaction) {
  if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
    return interaction.reply({ embeds: [errEmbed('You do not have permission to use this command.')], flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply();
  try { await interaction.deleteReply(); } catch {}

  const active = getEnabledRanks();

  if (active.length === 0) {
    return interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(GOLD)
          .setTitle('DHS Application System')
          .setDescription('There are currently no applications open at the moment!')
          .setTimestamp()
          .setFooter(FOOTER),
      ],
    });
  }

  const rankList = active.map((r) => `• ${rankNames[r.id] || r.id}`).join('\n');

  const dashEmbed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('DHS Application System')
    .setDescription(
      `Below are the current applications available at the moment. You may apply for more than one rank. If you get accepted into multiple, you will be placed into the highest one.\n\n**Currently Open:**\n${rankList}\n\nSelect a rank below to begin.`
    )
    .setTimestamp()
    .setFooter(FOOTER);

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('apply_select')
      .setPlaceholder('Select a rank to apply for...')
      .addOptions(active.map((r) => ({
        label: rankNames[r.id] || r.id,
        value: r.id,
        description: `Apply for ${rankNames[r.id] || r.id}`,
      })))
  );

  await interaction.channel.send({ embeds: [dashEmbed], components: [selectMenu] });
}

// ── /application-management ───────────────────────────────────
export const managementData = new SlashCommandBuilder()
  .setName('application-management')
  .setDescription('Manage the DHS application system configuration.');

export async function managementExecute(interaction) {
  if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
    return interaction.reply({ embeds: [errEmbed('You do not have permission to use this command.')], flags: MessageFlags.Ephemeral });
  }

  await interaction.reply({
    embeds: [buildMgmtOverviewEmbed()],
    components: [buildMgmtSelectMenu()],
    flags: MessageFlags.Ephemeral,
  });
}

function buildMgmtOverviewEmbed() {
  const lines = allRankIds.map((id) => {
    const entry = db.data.enabledRanks.find((r) => r.id === id);
    return `${rankNames[id] || id} — ${entry?.enabled ? 'Enabled' : 'Disabled'}`;
  });
  return new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: 'DHS Application Management' })
    .setTitle('Application System Configuration')
    .setDescription(lines.join('\n'))
    .setTimestamp()
    .setFooter(FOOTER);
}

function buildMgmtSelectMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('mgmt:select')
      .setPlaceholder('Select a rank to configure...')
      .addOptions(allRankIds.slice(0, 25).map((id) => ({
        label: rankNames[id] || id,
        value: id,
        description: `Configure ${rankNames[id] || id}`,
      })))
  );
}

function buildMgmtRankEmbed(rankId) {
  const entry = db.data.enabledRanks.find((r) => r.id === rankId);
  const isEnabled = entry?.enabled ?? false;
  return new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: 'DHS Application Management' })
    .setTitle(`Configure — ${rankNames[rankId] || rankId}`)
    .addFields(
      { name: 'Rank',   value: rankNames[rankId] || rankId, inline: true },
      { name: 'Status', value: isEnabled ? 'Enabled' : 'Disabled', inline: true }
    )
    .setTimestamp()
    .setFooter(FOOTER);
}

// ── Button & Select Handlers ──────────────────────────────────
export const buttons = {

  apply_select: async (interaction) => {
    const rankId = interaction.values[0];
    const member = interaction.member;

    if (isBlacklisted(member)) {
      return interaction.reply({
        embeds: [errEmbed('You are blacklisted and cannot submit an application.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (activeSessions.has(interaction.user.id)) {
      return interaction.reply({
        embeds: [errEmbed('You already have an application in progress. Please complete it in your DMs first.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (getAnyActiveApp(interaction.user.id)) {
      return interaction.reply({
        embeds: [errEmbed('You already have a pending application. You cannot start another until it is resolved.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!isRankEnabled(rankId)) {
      return interaction.reply({
        embeds: [errEmbed('This rank is no longer available for application.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(GOLD)
          .setAuthor({ name: 'DHS Application System' })
          .setTitle('Application Started')
          .setDescription(`The application process for **${rankNames[rankId]}** has started. Please check your DMs.`)
          .setTimestamp()
          .setFooter(FOOTER),
      ],
      flags: MessageFlags.Ephemeral,
    });

    const result = await runDmFlow(interaction.user, rankId, async (app) => {
      const channel = await interaction.client.channels.fetch(SUBMISSION_CHANNEL).catch(() => null);
      if (!channel) return;

      const msg = await channel.send({
        content: `<@${app.userId}>`,
        embeds: [submissionEmbed(app)],
        components: [actionButtons(app.id)],
      });

      const saved = db.data.applications.find((a) => a.id === app.id);
      if (saved) { saved.messageId = msg.id; await save(); }
    });

    if (!result.success && result.reason === 'dm_failed') {
      await interaction.followUp({
        embeds: [errEmbed('Unable to DM you. Please open your DMs and try again.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  appreview: async (interaction) => {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
      return interaction.reply({ embeds: [errEmbed('You do not have permission to review applications.')], flags: MessageFlags.Ephemeral });
    }

    const appId = interaction.customId.split(':')[1];
    const app = getAppById(appId);
    if (!app) return interaction.reply({ embeds: [errEmbed('Application not found.')], flags: MessageFlags.Ephemeral });

    const questions = rankQuestions[app.rankId] ?? [];

    const reviewEmbed = new EmbedBuilder()
      .setColor(DARK)
      .setAuthor({ name: 'Application Review' })
      .setTitle(`Review — ${app.username}`)
      .setThumbnail(app.avatarURL)
      .setDescription(`Reviewing application from <@${app.userId}> for ${rankNames[app.rankId]}.`)
      .addFields(
        { name: 'Applicant', value: `<@${app.userId}>`, inline: true },
        { name: 'Rank',      value: rankNames[app.rankId] || 'Unknown', inline: true },
        { name: 'Submitted', value: `<t:${Math.floor(new Date(app.createdAt).getTime() / 1000)}:F>`, inline: false },
        { name: 'Status',    value: app.status.charAt(0).toUpperCase() + app.status.slice(1), inline: true }
      )
      .setTimestamp()
      .setFooter(FOOTER);

    for (const q of questions) {
      const ans = app.answers.find((a) => a.questionId === q.id);
      reviewEmbed.addFields({ name: q.prompt.slice(0, 256), value: (ans?.value ?? '_No response_').slice(0, 1024), inline: false });
    }

    return interaction.reply({ embeds: [reviewEmbed], flags: MessageFlags.Ephemeral });
  },

  appaccept: async (interaction) => {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
      return interaction.reply({ embeds: [errEmbed('You do not have permission to accept applications.')], flags: MessageFlags.Ephemeral });
    }

    const appId = interaction.customId.split(':')[1];
    const app = getAppById(appId);
    if (!app) return interaction.reply({ embeds: [errEmbed('Application not found.')], flags: MessageFlags.Ephemeral });
    if (app.status !== 'pending') return interaction.reply({ embeds: [errEmbed(`This application has already been ${app.status}.`)], flags: MessageFlags.Ephemeral });

    app.status = 'accepted';
    app.reviewedBy = interaction.user.id;
    await save();

    await interaction.update({ embeds: [submissionEmbed(app)], components: [actionButtons(appId, true)] });
    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(GREEN)
          .setAuthor({ name: 'DHS Application System' })
          .setDescription(`The application from <@${app.userId}> for **${rankNames[app.rankId]}** was accepted by <@${interaction.user.id}>.`)
          .setTimestamp()
          .setFooter(FOOTER),
      ],
    });
  },

  appdeny: async (interaction) => {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
      return interaction.reply({ embeds: [errEmbed('You do not have permission to deny applications.')], flags: MessageFlags.Ephemeral });
    }

    const appId = interaction.customId.split(':')[1];
    const app = getAppById(appId);
    if (!app) return interaction.reply({ embeds: [errEmbed('Application not found.')], flags: MessageFlags.Ephemeral });
    if (app.status !== 'pending') return interaction.reply({ embeds: [errEmbed(`This application has already been ${app.status}.`)], flags: MessageFlags.Ephemeral });

    const modal = new ModalBuilder()
      .setCustomId(`denymodal:${appId}`)
      .setTitle('Deny Application')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason for denial')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Provide a reason for denying this application...')
            .setRequired(true)
            .setMaxLength(500)
        )
      );

    await interaction.showModal(modal);
  },

  appblacklist: async (interaction) => {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
      return interaction.reply({ embeds: [errEmbed('You do not have permission to blacklist applicants.')], flags: MessageFlags.Ephemeral });
    }

    const appId = interaction.customId.split(':')[1];
    const app = getAppById(appId);
    if (!app) return interaction.reply({ embeds: [errEmbed('Application not found.')], flags: MessageFlags.Ephemeral });
    if (app.status !== 'pending') return interaction.reply({ embeds: [errEmbed(`This application has already been ${app.status}.`)], flags: MessageFlags.Ephemeral });

    const presetRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`blacklistpreset:${appId}`)
        .setPlaceholder('Select a preset reason or choose custom...')
        .addOptions([
          { label: 'AI Usage', value: '0', description: 'Blacklisted for using AI on application' },
          { label: 'Trolling', value: '1', description: 'Blacklisted for trolling' },
          { label: 'Custom Reason', value: 'custom', description: 'Type your own reason' },
        ])
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(BLACK)
          .setAuthor({ name: 'DHS Application System' })
          .setTitle('Blacklist Applicant')
          .setDescription(`Select a reason to blacklist <@${app.userId}>.`)
          .setTimestamp()
          .setFooter(FOOTER),
      ],
      components: [presetRow],
      flags: MessageFlags.Ephemeral,
    });
  },

  'blacklistpreset': async (interaction) => {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
      return interaction.reply({ embeds: [errEmbed('You do not have permission.')], flags: MessageFlags.Ephemeral });
    }

    const appId = interaction.customId.split(':')[1];
    const app = getAppById(appId);
    if (!app) return interaction.reply({ embeds: [errEmbed('Application not found.')], flags: MessageFlags.Ephemeral });

    const choice = interaction.values[0];

    if (choice === 'custom') {
      const modal = new ModalBuilder()
        .setCustomId(`blacklistmodal:${appId}`)
        .setTitle('Blacklist — Custom Reason')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('reason')
              .setLabel('Reason for blacklist')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Provide a reason...')
              .setRequired(true)
              .setMaxLength(500)
          )
        );

      await interaction.showModal(modal);
      return;
    }

    const reason = BLACKLIST_PRESETS[parseInt(choice)];
    await executeBlacklist(interaction, app, appId, reason);
  },

  'mgmt:select': async (interaction) => {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
      return interaction.reply({ embeds: [errEmbed('You do not have permission.')], flags: MessageFlags.Ephemeral });
    }

    const rankId = interaction.values[0];
    const entry = db.data.enabledRanks.find((r) => r.id === rankId);
    const isEnabled = entry?.enabled ?? false;

    await interaction.update({
      embeds: [buildMgmtRankEmbed(rankId)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mgmt:enable:${rankId}`).setLabel('Enable').setStyle(ButtonStyle.Success).setDisabled(isEnabled),
        new ButtonBuilder().setCustomId(`mgmt:disable:${rankId}`).setLabel('Disable').setStyle(ButtonStyle.Danger).setDisabled(!isEnabled),
        new ButtonBuilder().setCustomId('mgmt:back').setLabel('Back').setStyle(ButtonStyle.Secondary)
      )],
    });
  },

  'mgmt:enable': async (interaction) => {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
      return interaction.reply({ embeds: [errEmbed('You do not have permission.')], flags: MessageFlags.Ephemeral });
    }

    const rankId = interaction.customId.split(':')[2];
    const existing = db.data.enabledRanks.find((r) => r.id === rankId);
    if (existing) { existing.enabled = true; } else { db.data.enabledRanks.push({ id: rankId, enabled: true }); }
    await save();

    await interaction.update({
      embeds: [buildMgmtRankEmbed(rankId)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mgmt:enable:${rankId}`).setLabel('Enable').setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId(`mgmt:disable:${rankId}`).setLabel('Disable').setStyle(ButtonStyle.Danger).setDisabled(false),
        new ButtonBuilder().setCustomId('mgmt:back').setLabel('Back').setStyle(ButtonStyle.Secondary)
      )],
    });
  },

  'mgmt:disable': async (interaction) => {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
      return interaction.reply({ embeds: [errEmbed('You do not have permission.')], flags: MessageFlags.Ephemeral });
    }

    const rankId = interaction.customId.split(':')[2];
    const existing = db.data.enabledRanks.find((r) => r.id === rankId);
    if (existing) { existing.enabled = false; await save(); }

    const pendingApps = db.data.applications.filter((a) => a.rankId === rankId && a.status === 'pending');
    for (const app of pendingApps) {
      const user = await interaction.client.users.fetch(app.userId).catch(() => null);
      if (user) {
        await user.send({ embeds: [errEmbed(`The application for ${rankNames[rankId]} has been disabled. If you believe this is a mistake, please open a ticket.`)] }).catch(() => null);
      }
    }

    await interaction.update({
      embeds: [buildMgmtRankEmbed(rankId)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mgmt:enable:${rankId}`).setLabel('Enable').setStyle(ButtonStyle.Success).setDisabled(false),
        new ButtonBuilder().setCustomId(`mgmt:disable:${rankId}`).setLabel('Disable').setStyle(ButtonStyle.Danger).setDisabled(true),
        new ButtonBuilder().setCustomId('mgmt:back').setLabel('Back').setStyle(ButtonStyle.Secondary)
      )],
    });
  },

  'mgmt:back': async (interaction) => {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
      return interaction.reply({ embeds: [errEmbed('You do not have permission.')], flags: MessageFlags.Ephemeral });
    }
    await interaction.update({ embeds: [buildMgmtOverviewEmbed()], components: [buildMgmtSelectMenu()] });
  },
};

// ── Modal Handlers ────────────────────────────────────────────
export const modals = {

  denymodal: async (interaction) => {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
      return interaction.reply({ embeds: [errEmbed('You do not have permission.')], flags: MessageFlags.Ephemeral });
    }

    const appId = interaction.customId.split(':')[1];
    const app = getAppById(appId);
    if (!app) return interaction.reply({ embeds: [errEmbed('Application not found.')], flags: MessageFlags.Ephemeral });
    if (app.status !== 'pending') return interaction.reply({ embeds: [errEmbed(`This application has already been ${app.status}.`)], flags: MessageFlags.Ephemeral });

    const reason = interaction.fields.getTextInputValue('reason');

    app.status = 'denied';
    app.reason = reason;
    app.reviewedBy = interaction.user.id;
    await save();

    const originalChannel = interaction.channel;
    if (app.messageId) {
      const msg = await originalChannel.messages.fetch(app.messageId).catch(() => null);
      if (msg) await msg.edit({ embeds: [submissionEmbed(app)], components: [actionButtons(appId, true)] }).catch(() => null);
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(RED)
          .setAuthor({ name: 'DHS Application System' })
          .setDescription(`The application from <@${app.userId}> for **${rankNames[app.rankId]}** was denied by <@${interaction.user.id}>.`)
          .addFields({ name: 'Reason', value: `\`\`\`${reason}\`\`\``, inline: false })
          .setTimestamp()
          .setFooter(FOOTER),
      ],
    });

    const user = await interaction.client.users.fetch(app.userId).catch(() => null);
    if (user) {
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setColor(RED)
            .setAuthor({ name: 'DHS Application System' })
            .setTitle('Application Denied')
            .setDescription(`Your application for **${rankNames[app.rankId]}** has been denied.`)
            .addFields({ name: 'Reason', value: `\`\`\`${reason}\`\`\``, inline: false })
            .setTimestamp()
            .setFooter(FOOTER),
        ],
      }).catch(() => null);
    }
  },

  blacklistmodal: async (interaction) => {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
      return interaction.reply({ embeds: [errEmbed('You do not have permission.')], flags: MessageFlags.Ephemeral });
    }

    const appId = interaction.customId.split(':')[1];
    const app = getAppById(appId);
    if (!app) return interaction.reply({ embeds: [errEmbed('Application not found.')], flags: MessageFlags.Ephemeral });

    const reason = interaction.fields.getTextInputValue('reason');
    await executeBlacklist(interaction, app, appId, reason);
  },
};

async function executeBlacklist(interaction, app, appId, reason) {
  app.status = 'blacklisted';
  app.reason = reason;
  app.reviewedBy = interaction.user.id;
  await save();

  const guild = interaction.guild;
  const member = await guild.members.fetch(app.userId).catch(() => null);
  if (member) {
    await member.roles.add(BLACKLIST_ROLE).catch(() => null);
  }

  await autoDenyBlacklistedApps(interaction.client, app.userId);

  const originalChannel = interaction.channel;
  if (app.messageId) {
    const msg = await originalChannel.messages.fetch(app.messageId).catch(() => null);
    if (msg) await msg.edit({ embeds: [submissionEmbed(app)], components: [actionButtons(appId, true)] }).catch(() => null);
  }

  await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(BLACK)
        .setAuthor({ name: 'DHS Application System' })
        .setDescription(`<@${app.userId}> has been blacklisted by <@${interaction.user.id}> for **${rankNames[app.rankId]}**.`)
        .addFields({ name: 'Reason', value: `\`\`\`${reason}\`\`\``, inline: false })
        .setTimestamp()
        .setFooter(FOOTER),
    ],
  });

  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferUpdate().catch(() => null);
  }

  const user = await interaction.client.users.fetch(app.userId).catch(() => null);
  if (user) {
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(BLACK)
          .setAuthor({ name: 'DHS Application System' })
          .setTitle('Application Blacklisted')
          .setDescription(`Your application for **${rankNames[app.rankId]}** has resulted in a blacklist.`)
          .addFields({ name: 'Reason', value: `\`\`\`${reason}\`\`\``, inline: false })
          .setTimestamp()
          .setFooter(FOOTER),
      ],
    }).catch(() => null);
  }
}
