import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  MessageFlags,
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

const FOOTER = { text: 'Department of Homeland Security • Applications' };
const GOLD = 0xd4af37;
const RED  = 0xc0392b;
const GREEN = 0x2ecc71;
const DARK  = 0x2c2f33;

const rankQuestions = Object.fromEntries(RANKS.map((r) => [r.id, r.questions]));
const rankNames     = Object.fromEntries(RANKS.map((r) => [r.id, r.name]));
const allRankIds    = RANKS.map((r) => r.id);

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

function getPendingApp(userId, rankId) {
  return db.data.applications.find(
    (a) => a.userId === userId && a.rankId === rankId && a.status === 'pending'
  );
}

function getAnyActiveApp(userId) {
  return db.data.applications.find(
    (a) => a.userId === userId && a.status === 'pending'
  );
}

function getAppById(id) {
  return db.data.applications.find((a) => a.id === id);
}

function isRankEnabled(rankId) {
  return db.data.enabledRanks.some((r) => r.id === rankId && r.enabled);
}

function actionButtons(appId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`appreview:${appId}`).setLabel('Review').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`appaccept:${appId}`).setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`appdeny:${appId}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

function submissionEmbed(app) {
  const statusColor = app.status === 'accepted' ? GREEN : app.status === 'denied' ? RED : GOLD;
  return new EmbedBuilder()
    .setColor(statusColor)
    .setAuthor({ name: 'DHS Application System' })
    .setTitle(`Application for ${rankNames[app.rankId] || 'Unknown Rank'}`)
    .setThumbnail(app.avatarURL)
    .setDescription(`<@${app.userId}> has submitted an application.`)
    .addFields(
      { name: 'User',         value: `<@${app.userId}>`,  inline: true },
      { name: 'Role Applied', value: rankNames[app.rankId] || 'Unknown', inline: true },
      { name: 'Submitted',    value: `<t:${Math.floor(new Date(app.createdAt).getTime() / 1000)}:F>`, inline: false },
      { name: 'Status',       value: app.status.charAt(0).toUpperCase() + app.status.slice(1), inline: true }
    )
    .setTimestamp()
    .setFooter(FOOTER);
}

function buildSummaryEmbed(questions, answers, rankId) {
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setAuthor({ name: 'DHS Application System' })
    .setTitle('Application Summary')
    .setDescription('Review your responses below. You may edit any answer before submitting.')
    .setTimestamp()
    .setFooter(FOOTER);

  for (const q of questions) {
    const ans = answers.find((a) => a.questionId === q.id);
    embed.addFields({ name: q.prompt, value: ans?.value || '_No response_', inline: false });
  }

  return embed;
}

function buildSummaryComponents(questions, submitted = false) {
  const rows = [];

  if (!submitted) {
    const editSelect = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('app:edit_select')
        .setPlaceholder('Select a question to edit...')
        .addOptions(
          questions.map((q, i) => ({
            label: `Question ${i + 1}`,
            description: q.prompt.slice(0, 50),
            value: q.id,
          }))
        )
    );

    const submitRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('app:submit')
        .setLabel('Submit Application')
        .setStyle(ButtonStyle.Success)
    );

    rows.push(editSelect, submitRow);
  }

  return rows;
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
          new ButtonBuilder()
            .setCustomId(`dmq:${idx}`)
            .setLabel(label)
            .setStyle(ButtonStyle.Secondary)
        )
      );

      const msg = await dm.send({ embeds: [qEmbed], components: [row] }).catch(() => null);
      if (!msg) return { success: false, reason: 'dm_failed' };

      let chosen;
      try {
        const btn = await msg.awaitMessageComponent({
          filter: (b) => b.user.id === user.id,
          componentType: ComponentType.Button,
          time: 300_000,
        });
        const idx = parseInt(btn.customId.split(':')[1]);
        chosen = q.choices[idx];
        await btn.update({
          components: [new ActionRowBuilder().addComponents(
            q.choices.slice(0, 5).map((label, j) =>
              new ButtonBuilder()
                .setCustomId(`dmq:${j}`)
                .setLabel(label)
                .setStyle(j === idx ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(true)
            )
          )],
        });
      } catch {
        await dm.send({ embeds: [errEmbed('Your application timed out. Please restart.')] }).catch(() => null);
        activeSessions.delete(user.id);
        return { success: false, reason: 'timeout' };
      }

      answers.push({ questionId: q.id, value: chosen });

    } else {
      await dm.send({ embeds: [qEmbed] }).catch(() => null);

      let collected;
      try {
        collected = await dm.awaitMessages({
          filter: (m) => m.author.id === user.id,
          max: 1,
          time: 300_000,
          errors: ['time'],
        });
      } catch {
        await dm.send({ embeds: [errEmbed('Your application timed out. Please restart.')] }).catch(() => null);
        activeSessions.delete(user.id);
        return { success: false, reason: 'timeout' };
      }

      answers.push({ questionId: q.id, value: collected.first().content.trim() });
    }
  }

  if (!isRankEnabled(rankId)) {
    await dm.send({ embeds: [errEmbed(`The application for ${rankName} has been disabled. If you believe this is a mistake, please open a ticket.`)] }).catch(() => null);
    activeSessions.delete(user.id);
    return { success: false, reason: 'disabled' };
  }

  const summaryMsg = await dm.send({
    embeds: [buildSummaryEmbed(questions, answers, rankId)],
    components: buildSummaryComponents(questions, false),
  }).catch(() => null);

  if (!summaryMsg) return { success: false, reason: 'dm_failed' };

  const sessionAnswers = [...answers];

  const collector = summaryMsg.createMessageComponentCollector({
    filter: (i) => i.user.id === user.id,
    time: 600_000,
  });

  return new Promise((resolve) => {
    let editingQuestionId = null;

    collector.on('collect', async (i) => {
      if (i.customId === 'app:submit') {
        collector.stop('submitted');

        await i.update({
          embeds: [buildSummaryEmbed(questions, sessionAnswers, rankId)],
          components: [],
        });

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
        };

        db.data.applications.push(app);
        await save();

        activeSessions.delete(user.id);
        await onComplete(app);
        resolve({ success: true, app });
        return;
      }

      if (i.customId === 'app:edit_select') {
        editingQuestionId = i.values[0];
        const q = questions.find((q) => q.id === editingQuestionId);

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
            max: 1,
            time: 300_000,
            errors: ['time'],
          });

          const newValue = collected.first().content.trim();
          const existing = sessionAnswers.find((a) => a.questionId === editingQuestionId);
          if (existing) existing.value = newValue;

          await summaryMsg.edit({
            embeds: [buildSummaryEmbed(questions, sessionAnswers, rankId)],
            components: buildSummaryComponents(questions, false),
          });

        } catch {
          await dm.send({ embeds: [errEmbed('Edit timed out. Your previous answer was kept.')] }).catch(() => null);
        }

        editingQuestionId = null;
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

// /application
export const data = new SlashCommandBuilder()
  .setName('application')
  .setDescription('Send the application dashboard.');

export async function execute(interaction) {
  if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
    return interaction.reply({
      embeds: [errEmbed('You do not have permission to use this command.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();
  try { await interaction.deleteReply(); } catch {}

  const active = getEnabledRanks();

  const dashEmbed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle('DHS Application System')
    .setDescription(
      active.length === 0
        ? 'There are currently no applications open at the moment!'
        : 'Below are the current applications available at the moment. You may apply for more than one rank. If you get accepted into multiple, you will be placed into the highest one.\n\nSelect a rank below to begin.'
    )
    .setTimestamp()
    .setFooter(FOOTER);

  if (active.length === 0) {
    return interaction.channel.send({ embeds: [dashEmbed] });
  }

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('apply_select')
      .setPlaceholder('Select a rank to apply for...')
      .addOptions(
        active.map((r) => ({
          label: rankNames[r.id] || r.id,
          value: r.id,
          description: `Apply for ${rankNames[r.id] || r.id}`,
        }))
      )
  );

  await interaction.channel.send({ embeds: [dashEmbed], components: [selectMenu] });
}

// /application-management
export const managementData = new SlashCommandBuilder()
  .setName('application-management')
  .setDescription('Manage the DHS application system configuration.');

export async function managementExecute(interaction) {
  if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
    return interaction.reply({
      embeds: [errEmbed('You do not have permission to use this command.')],
      flags: MessageFlags.Ephemeral,
    });
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
      .addOptions(
        allRankIds.slice(0, 25).map((id) => ({
          label: rankNames[id] || id,
          value: id,
          description: `Configure ${rankNames[id] || id}`,
        }))
      )
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

export const buttons = {

  apply_select: async (interaction) => {
    const rankId = interaction.values[0];

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
        { name: 'Applicant', value: `<@${app.userId}>`,  inline: true },
        { name: 'Rank',      value: rankNames[app.rankId] || 'Unknown', inline: true },
        { name: 'Submitted', value: `<t:${Math.floor(new Date(app.createdAt).getTime() / 1000)}:F>`, inline: false },
        { name: 'Status',    value: app.status.charAt(0).toUpperCase() + app.status.slice(1), inline: true }
      )
      .setTimestamp()
      .setFooter(FOOTER);

    for (const q of questions) {
      const ans = app.answers.find((a) => a.questionId === q.id);
      reviewEmbed.addFields({ name: q.prompt, value: ans?.value ?? '_No response_', inline: false });
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

    app.status = 'denied';
    app.reviewedBy = interaction.user.id;
    await save();

    await interaction.update({ embeds: [submissionEmbed(app)], components: [actionButtons(appId, true)] });
    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(RED)
          .setAuthor({ name: 'DHS Application System' })
          .setDescription(`The application from <@${app.userId}> for **${rankNames[app.rankId]}** was denied by <@${interaction.user.id}>.`)
          .setTimestamp()
          .setFooter(FOOTER),
      ],
    });
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
        await user.send({
          embeds: [errEmbed(`The application for ${rankNames[rankId]} has been disabled. If you believe this is a mistake, please open a ticket.`)],
        }).catch(() => null);
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
