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
import { DASHBOARD_ROLE, STAFF_ROLE, SUBMISSION_CHANNEL, RANKS } from './appConfig.js';

// ── Database ──────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────
const FOOTER = { text: 'Department of Homeland Security • Applications' };
const GOLD   = 0xd4af37;
const RED    = 0xc0392b;
const GREEN  = 0x2ecc71;
const DARK   = 0x2c2f33;

const rankQuestions = Object.fromEntries(RANKS.map((r) => [r.id, r.questions]));
const allRankIds    = RANKS.map((r) => r.id);

function embed(color, description) {
    return new EmbedBuilder()
        .setColor(color)
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

function getAppById(id) {
    return db.data.applications.find((a) => a.id === id);
}

function rankButtons(guild) {
    const active = getEnabledRanks();
    const rows = [];
    for (let i = 0; i < active.length; i += 5) {
        const chunk = active.slice(i, i + 5);
        rows.push(
            new ActionRowBuilder().addComponents(
                chunk.map((r) => {
                    const role = guild.roles.cache.get(r.id);
                    return new ButtonBuilder()
                        .setCustomId(`apply:${r.id}`)
                        .setLabel(role?.name ?? r.id)
                        .setStyle(ButtonStyle.Secondary);
                })
            )
        );
    }
    return rows;
}

function actionButtons(appId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`appreview:${appId}`).setLabel('Review').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`appaccept:${appId}`).setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`appdeny:${appId}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setDisabled(disabled)
    );
}

// ── DM Flow ───────────────────────────────────────────────────
async function runDmFlow(user, rankId, guild, onComplete) {
    const questions = rankQuestions[rankId];

    let dm;
    try { dm = await user.createDM(); }
    catch { return { success: false, reason: 'dm_failed' }; }

    if (!questions?.length) {
        await dm.send({ embeds: [embed(RED, 'This application is not currently set up. Please contact staff.')] }).catch(() => null);
        return { success: false, reason: 'no_questions' };
    }

    const answers = [];

    for (let i = 0; i < questions.length; i++) {
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
                const btnInteraction = await msg.awaitMessageComponent({
                    filter: (btn) => btn.user.id === user.id,
                    componentType: ComponentType.Button,
                    time: 300_000,
                });
                const idx = parseInt(btnInteraction.customId.split(':')[1]);
                chosen = q.choices[idx];
                const disabledRow = new ActionRowBuilder().addComponents(
                    q.choices.slice(0, 5).map((label, j) =>
                        new ButtonBuilder()
                            .setCustomId(`dmq:${j}`)
                            .setLabel(label)
                            .setStyle(j === idx ? ButtonStyle.Primary : ButtonStyle.Secondary)
                            .setDisabled(true)
                    )
                );
                await btnInteraction.update({ components: [disabledRow] });
            } catch {
                await dm.send({ embeds: [embed(RED, 'Your application timed out. Please restart.')] }).catch(() => null);
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
                await dm.send({ embeds: [embed(RED, 'Your application timed out. Please restart.')] }).catch(() => null);
                return { success: false, reason: 'timeout' };
            }

            answers.push({ questionId: q.id, value: collected.first().content.trim() });
        }
    }

    const app = {
        id: randomUUID(),
        userId: user.id,
        rankId,
        username: user.tag,
        avatarURL: user.displayAvatarURL({ dynamic: true }),
        answers,
        status: 'pending',
        createdAt: new Date().toISOString(),
        reviewedBy: null,
        messageId: null,
    };

    db.data.applications.push(app);
    await save();

    const summaryEmbed = new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: 'DHS Application System' })
        .setTitle('Application Submitted')
        .setDescription('Your application has been submitted. Here is a summary of your responses.')
        .setTimestamp()
        .setFooter(FOOTER);

    for (const q of questions) {
        const ans = answers.find((a) => a.questionId === q.id);
        summaryEmbed.addFields({ name: q.prompt, value: ans?.value || '*No response*', inline: false });
    }

    await dm.send({ embeds: [summaryEmbed] }).catch(() => null);
    await onComplete(app);

    return { success: true, app };
}

// ── /application command ──────────────────────────────────────
export const data = new SlashCommandBuilder()
    .setName('application')
    .setDescription('Open the DHS application dashboard.');

export async function execute(interaction) {
    if (!interaction.member.roles.cache.has(DASHBOARD_ROLE)) {
        return interaction.reply({ embeds: [embed(RED, 'You do not have permission to use this command.')], flags: MessageFlags.Ephemeral });
    }

    const active = getEnabledRanks();
    if (!active.length) {
        return interaction.reply({ embeds: [embed(RED, 'There are no ranks currently available for application.')], flags: MessageFlags.Ephemeral });
    }

    const dashEmbed = new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: 'DHS Application System' })
        .setTitle('Application Dashboard')
        .setDescription('These are the current ranks available for application.\n\nSelect a rank below to begin.')
        .setTimestamp()
        .setFooter(FOOTER);

    await interaction.reply({ embeds: [dashEmbed], components: rankButtons(interaction.guild) });
}

// ── /application-management command ──────────────────────────
export const managementData = new SlashCommandBuilder()
    .setName('application-management')
    .setDescription('Manage the DHS application system configuration.');

export async function managementExecute(interaction) {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
        return interaction.reply({ embeds: [embed(RED, 'You do not have permission to use this command.')], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({ embeds: [buildManagementEmbed()], components: [buildManagementMenu(interaction.guild)], flags: MessageFlags.Ephemeral });
}

function buildManagementEmbed() {
    const lines = allRankIds.map((id) => {
        const entry = db.data.enabledRanks.find((r) => r.id === id);
        return `<@&${id}> — ${entry?.enabled ? 'Enabled' : 'Disabled'}`;
    });
    return new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: 'DHS Application Management' })
        .setTitle('Application System Configuration')
        .setDescription(lines.join('\n'))
        .setTimestamp()
        .setFooter(FOOTER);
}

function buildManagementMenu(guild) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mgmt:select')
            .setPlaceholder('Select a rank to configure')
            .addOptions(
                allRankIds.slice(0, 25).map((id) => {
                    const role = guild.roles.cache.get(id);
                    return { label: role?.name ?? id, value: id, description: id };
                })
            )
    );
}

// ── Button & Select Menu Handlers ─────────────────────────────
export const buttons = {
    apply: async (interaction) => {
        const rankId = interaction.customId.split(':')[1];

        if (getPendingApp(interaction.user.id, rankId)) {
            return interaction.reply({ embeds: [embed(RED, 'You already have a pending application for this rank.')], flags: MessageFlags.Ephemeral });
        }

        const entry = db.data.enabledRanks.find((r) => r.id === rankId && r.enabled);
        if (!entry) {
            return interaction.reply({ embeds: [embed(RED, 'This rank is no longer available for application.')], flags: MessageFlags.Ephemeral });
        }

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(GOLD)
                    .setAuthor({ name: 'DHS Application System' })
                    .setTitle('Application Started')
                    .setDescription(`The application process for <@&${rankId}> has started. Please check your DMs.`)
                    .setTimestamp()
                    .setFooter(FOOTER),
            ],
            flags: MessageFlags.Ephemeral,
        });

        const result = await runDmFlow(interaction.user, rankId, interaction.guild, async (app) => {
            const channel = await interaction.client.channels.fetch(SUBMISSION_CHANNEL).catch(() => null);
            if (!channel) return;

            const subEmbed = new EmbedBuilder()
                .setColor(GOLD)
                .setAuthor({ name: 'DHS Application System' })
                .setTitle(`Application for <@&${rankId}>`)
                .setThumbnail(app.avatarURL)
                .setDescription(`<@${app.userId}> has submitted an application for <@&${rankId}>.`)
                .addFields(
                    { name: 'User',           value: `<@${app.userId}>`,    inline: true  },
                    { name: 'User ID',        value: `\`${app.userId}\``,   inline: true  },
                    { name: 'Role Applied',   value: `<@&${rankId}>`,        inline: false },
                    { name: 'Application ID', value: `\`${app.id}\``,        inline: false },
                    { name: 'Submitted',      value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: 'Status',         value: 'Pending Review',        inline: true  }
                )
                .setTimestamp()
                .setFooter(FOOTER);

            const msg = await channel.send({
                content: `<@${app.userId}>`,
                embeds: [subEmbed],
                components: [actionButtons(app.id)],
            });

            const saved = db.data.applications.find((a) => a.id === app.id);
            if (saved) { saved.messageId = msg.id; await save(); }
        });

        if (!result.success && result.reason === 'dm_failed') {
            await interaction.followUp({ embeds: [embed(RED, 'Unable to DM you. Please open your DMs and try again.')], flags: MessageFlags.Ephemeral });
        }
    },

    appreview: async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ embeds: [embed(RED, 'You do not have permission to review applications.')], flags: MessageFlags.Ephemeral });
        }

        const appId = interaction.customId.split(':')[1];
        const app = getAppById(appId);
        if (!app) return interaction.reply({ embeds: [embed(RED, 'Application not found.')], flags: MessageFlags.Ephemeral });

        const questions = rankQuestions[app.rankId] ?? [];

        const reviewEmbed = new EmbedBuilder()
            .setColor(DARK)
            .setAuthor({ name: 'Application Review' })
            .setTitle(`Review — ${app.username}`)
            .setThumbnail(app.avatarURL)
            .setDescription(`Reviewing application from <@${app.userId}> for <@&${app.rankId}>.`)
            .addFields(
                { name: 'Applicant', value: `<@${app.userId}>`,  inline: true },
                { name: 'User ID',   value: `\`${app.userId}\``, inline: true },
                { name: 'Rank',      value: `<@&${app.rankId}>`, inline: false },
                { name: 'Submitted', value: `<t:${Math.floor(new Date(app.createdAt).getTime() / 1000)}:F>`, inline: true },
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
            return interaction.reply({ embeds: [embed(RED, 'You do not have permission to accept applications.')], flags: MessageFlags.Ephemeral });
        }

        const appId = interaction.customId.split(':')[1];
        const app = getAppById(appId);
        if (!app) return interaction.reply({ embeds: [embed(RED, 'Application not found.')], flags: MessageFlags.Ephemeral });

        if (app.status !== 'pending') {
            return interaction.reply({ embeds: [embed(RED, `This application has already been ${app.status}.`)], flags: MessageFlags.Ephemeral });
        }

        app.status = 'accepted';
        app.reviewedBy = interaction.user.id;
        await save();

        await interaction.update({ components: [actionButtons(appId, true)] });
        await interaction.channel.send({ content: `The application from <@${app.userId}> for <@&${app.rankId}> was accepted by <@${interaction.user.id}>.` });
    },

    appdeny: async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ embeds: [embed(RED, 'You do not have permission to deny applications.')], flags: MessageFlags.Ephemeral });
        }

        const appId = interaction.customId.split(':')[1];
        const app = getAppById(appId);
        if (!app) return interaction.reply({ embeds: [embed(RED, 'Application not found.')], flags: MessageFlags.Ephemeral });

        if (app.status !== 'pending') {
            return interaction.reply({ embeds: [embed(RED, `This application has already been ${app.status}.`)], flags: MessageFlags.Ephemeral });
        }

        app.status = 'denied';
        app.reviewedBy = interaction.user.id;
        await save();

        await interaction.update({ components: [actionButtons(appId, true)] });
        await interaction.channel.send({ content: `The application from <@${app.userId}> for <@&${app.rankId}> was denied by <@${interaction.user.id}>.` });
    },

    'mgmt:select': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ embeds: [embed(RED, 'You do not have permission.')], flags: MessageFlags.Ephemeral });
        }

        const rankId = interaction.values[0];
        const entry = db.data.enabledRanks.find((r) => r.id === rankId);
        const isEnabled = entry?.enabled ?? false;
        const role = interaction.guild.roles.cache.get(rankId);

        const rankEmbed = new EmbedBuilder()
            .setColor(GOLD)
            .setAuthor({ name: 'DHS Application Management' })
            .setTitle('Rank Configuration')
            .addFields(
                { name: 'Rank',   value: `<@&${rankId}>`,          inline: true },
                { name: 'Name',   value: role?.name ?? rankId,      inline: true },
                { name: 'Status', value: isEnabled ? 'Enabled' : 'Disabled', inline: true }
            )
            .setTimestamp()
            .setFooter(FOOTER);

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mgmt:enable:${rankId}`).setLabel('Enable').setStyle(ButtonStyle.Success).setDisabled(isEnabled),
            new ButtonBuilder().setCustomId(`mgmt:disable:${rankId}`).setLabel('Disable').setStyle(ButtonStyle.Danger).setDisabled(!isEnabled),
            new ButtonBuilder().setCustomId(`mgmt:remove:${rankId}`).setLabel('Remove from System').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('mgmt:back').setLabel('Back').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [rankEmbed], components: [actionRow] });
    },

    'mgmt:enable': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ embeds: [embed(RED, 'You do not have permission.')], flags: MessageFlags.Ephemeral });
        }

        const rankId = interaction.customId.split(':')[2];
        const existing = db.data.enabledRanks.find((r) => r.id === rankId);
        if (existing) { existing.enabled = true; } else { db.data.enabledRanks.push({ id: rankId, enabled: true }); }
        await save();

        await interaction.update({ embeds: [buildManagementEmbed(), embed(GREEN, `<@&${rankId}> has been enabled.`)], components: [buildManagementMenu(interaction.guild)] });
    },

    'mgmt:disable': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ embeds: [embed(RED, 'You do not have permission.')], flags: MessageFlags.Ephemeral });
        }

        const rankId = interaction.customId.split(':')[2];
        const existing = db.data.enabledRanks.find((r) => r.id === rankId);
        if (existing) { existing.enabled = false; await save(); }

        await interaction.update({ embeds: [buildManagementEmbed(), embed(RED, `<@&${rankId}> has been disabled.`)], components: [buildManagementMenu(interaction.guild)] });
    },

    'mgmt:remove': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ embeds: [embed(RED, 'You do not have permission.')], flags: MessageFlags.Ephemeral });
        }

        const rankId = interaction.customId.split(':')[2];
        db.data.enabledRanks = db.data.enabledRanks.filter((r) => r.id !== rankId);
        await save();

        await interaction.update({ embeds: [buildManagementEmbed(), embed(0x95a5a6, `<@&${rankId}> has been removed from the system.`)], components: [buildManagementMenu(interaction.guild)] });
    },

    'mgmt:back': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ embeds: [embed(RED, 'You do not have permission.')], flags: MessageFlags.Ephemeral });
        }
        await interaction.update({ embeds: [buildManagementEmbed()], components: [buildManagementMenu(interaction.guild)] });
    },
};