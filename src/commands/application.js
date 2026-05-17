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
import { DASHBOARD_ROLE, STAFF_ROLE, SUBMISSION_CHANNEL, RANKS, OPERATIONS_CHIEF_ROLE } from '../appConfig.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../data');
mkdirSync(dataDir, { recursive: true });

const db = new Low(new JSONFile(join(dataDir, 'applications.json')), {
    enabledRanks: [],
    applications: [],
    activeApplications: new Map(),
});
await db.read();
if (!db.data.activeApplications) db.data.activeApplications = new Map();
db.data = { enabledRanks: [], applications: [], activeApplications: new Map(), ...db.data };
await db.write();

const save = () => db.write();

const FOOTER = { text: 'Department of Homeland Security • Applications' };
const GOLD = 0xd4af37;
const RED = 0xc0392b;
const GREEN = 0x2ecc71;
const DARK = 0x2c2f33;

const rankQuestions = Object.fromEntries(RANKS.map((r) => [r.id, r.questions]));
const rankNames = Object.fromEntries(RANKS.map((r) => [r.id, r.name]));

function embed(color, description) {
    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: '# DHS Application System' })
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

function createApplicationEmbed(app, status = null) {
    const embed = new EmbedBuilder()
        .setColor(app.status === 'accepted' ? GREEN : app.status === 'denied' ? RED : GOLD)
        .setAuthor({ name: 'DHS Application System' })
        .setTitle(`Application for ${rankNames[app.rankId] || 'Unknown Rank'}`)
        .setThumbnail(app.avatarURL)
        .setDescription(`<@${app.userId}> has submitted an application.`)
        .addFields(
            { name: 'User', value: `<@${app.userId}>`, inline: true },
            { name: 'Role Applied', value: rankNames[app.rankId] || 'Unknown', inline: true },
            { name: 'Submitted', value: `<t:${Math.floor(new Date(app.createdAt).getTime() / 1000)}:F>`, inline: false },
            { name: 'Status', value: app.status.charAt(0).toUpperCase() + app.status.slice(1), inline: true }
        )
        .setTimestamp()
        .setFooter(FOOTER);
    
    return embed;
}

function createDashboardEmbed() {
    const active = getEnabledRanks();
    
    if (active.length === 0) {
        return new EmbedBuilder()
            .setColor(RED)
            .setAuthor({ name: 'DHS Application System' })
            .setDescription('There are currently no applications open at the moment!')
            .setTimestamp()
            .setFooter(FOOTER);
    }
    
    const rankList = active.map(r => `• ${rankNames[r.id] || r.id}`).join('\n');
    
    return new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: 'DHS Application System' })
        .setDescription(`Below are the current applications available at the moment. You may apply for more than one rank. If you get accepted into multiple, you will be placed into the highest one.\n\n**Available Ranks:**\n${rankList}\n\nSelect a rank from the dropdown below to begin.`)
        .setTimestamp()
        .setFooter(FOOTER);
}

function createRankSelectMenu() {
    const active = getEnabledRanks();
    
    if (active.length === 0) return null;
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('apply_select')
            .setPlaceholder('Select a rank to apply for...')
            .addOptions(
                active.map((rank) => ({
                    label: rankNames[rank.id] || rank.id,
                    value: rank.id,
                    description: `Apply for ${rankNames[rank.id] || rank.id} position`,
                }))
            )
    );
}

function actionButtons(appId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`appreview:${appId}`).setLabel('Review').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`appaccept:${appId}`).setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`appdeny:${appId}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setDisabled(disabled)
    );
}

async function runDmFlow(user, rankId, interaction, onComplete) {
    const questions = rankQuestions[rankId];
    const rankName = rankNames[rankId];

    let dm;
    try { dm = await user.createDM(); }
    catch { return { success: false, reason: 'dm_failed' }; }

    if (!questions?.length) {
        await dm.send({ embeds: [embed(RED, 'This application is not currently set up. Please contact staff.')] }).catch(() => null);
        return { success: false, reason: 'no_questions' };
    }

    const checkIfStillEnabled = () => {
        const entry = db.data.enabledRanks.find((r) => r.id === rankId && r.enabled);
        return !!entry;
    };

    const answers = [];

    for (let i = 0; i < questions.length; i++) {
        if (!checkIfStillEnabled()) {
            await dm.send({ embeds: [embed(RED, `The application for ${rankName} has been disabled. If you believe this is a mistake, please open a ticket.`)] }).catch(() => null);
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

            const answer = collected.first().content.trim();
            answers.push({ questionId: q.id, value: answer });
            
            const editRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('edit_answer')
                    .setLabel('Edit Response')
                    .setStyle(ButtonStyle.Secondary)
            );
            
            const confirmEmbed = new EmbedBuilder()
                .setColor(GREEN)
                .setDescription(`> **Your response has been saved:**\n> ${answer}\n\nIf you want to change your answer, click the Edit Response button below.`)
                .setTimestamp();
            
            const editMsg = await dm.send({ embeds: [confirmEmbed], components: [editRow] }).catch(() => null);
            
            if (editMsg) {
                try {
                    const editInteraction = await editMsg.awaitMessageComponent({
                        filter: (btn) => btn.user.id === user.id,
                        time: 30_000,
                    });
                    
                    if (editInteraction.customId === 'edit_answer') {
                        await editInteraction.update({ embeds: [qEmbed], components: [] });
                        
                        const newCollected = await dm.awaitMessages({
                            filter: (m) => m.author.id === user.id,
                            max: 1,
                            time: 300_000,
                            errors: ['time'],
                        });
                        
                        const newAnswer = newCollected.first().content.trim();
                        answers[answers.length - 1].value = newAnswer;
                        
                        await dm.send({ embeds: [embed(GREEN, 'Your response has been updated!')] }).catch(() => null);
                    }
                } catch {
                    // No edit requested, continue
                }
            }
        }
    }

    if (!checkIfStillEnabled()) {
        await dm.send({ embeds: [embed(RED, `The application for ${rankName} has been disabled. If you believe this is a mistake, please open a ticket.`)] }).catch(() => null);
        return { success: false, reason: 'disabled' };
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

export const data = new SlashCommandBuilder()
    .setName('application')
    .setDescription('Send application dashboard.');

export async function execute(interaction) {
    if (!interaction.member.roles.cache.has(DASHBOARD_ROLE)) {
        return interaction.reply({ 
            embeds: [embed(RED, 'You do not have permission to use this command.')], 
            flags: MessageFlags.Ephemeral 
        });
    }

    await interaction.deferReply();
    
    try {
        await interaction.deleteReply();
    } catch (err) {}

    const dashboardEmbed = createDashboardEmbed();
    const selectMenu = createRankSelectMenu();
    
    if (selectMenu) {
        await interaction.channel.send({ embeds: [dashboardEmbed], components: [selectMenu] });
    } else {
        await interaction.channel.send({ embeds: [dashboardEmbed] });
    }
}

export const managementData = new SlashCommandBuilder()
    .setName('application-management')
    .setDescription('Manage the DHS application system configuration.');

export async function managementExecute(interaction) {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
        return interaction.reply({ 
            embeds: [embed(RED, 'You do not have permission to use this command.')], 
            flags: MessageFlags.Ephemeral 
        });
    }

    const uniqueRanks = RANKS.filter(rank => rank.id !== OPERATIONS_CHIEF_ROLE);

    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mgmt:select')
            .setPlaceholder('Select a rank to configure')
            .addOptions([
                ...uniqueRanks.map((rank) => ({
                    label: rank.name,
                    value: rank.id,
                    description: `Configure ${rank.name}`,
                }))
            ])
    );

    const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: 'DHS Application Management' })
        .setTitle('Application System Configuration')
        .setDescription('Select a rank from the dropdown to enable/disable applications for that rank.')
        .setTimestamp()
        .setFooter(FOOTER);

    await interaction.reply({ embeds: [embed], components: [selectMenu], flags: MessageFlags.Ephemeral });
}

function buildManagementEmbed(rankId) {
    const entry = db.data.enabledRanks.find((r) => r.id === rankId);
    const isEnabled = entry?.enabled ?? false;
    const rankName = rankNames[rankId] || 'Unknown Rank';
    
    return new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: 'DHS Application Management' })
        .setTitle(`Configure ${rankName}`)
        .addFields(
            { name: 'Rank', value: rankName, inline: true },
            { name: 'Status', value: isEnabled ? '✅ Enabled' : '❌ Disabled', inline: true }
        )
        .setTimestamp()
        .setFooter(FOOTER);
}

export const buttons = {
    'apply_select': async (interaction) => {
        const rankId = interaction.values[0];
        const rankName = rankNames[rankId];

        if (getPendingApp(interaction.user.id, rankId)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'You already have a pending application for this rank.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const entry = db.data.enabledRanks.find((r) => r.id === rankId && r.enabled);
        if (!entry) {
            return interaction.reply({ 
                embeds: [embed(RED, 'This rank is no longer available for application.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(GOLD)
                    .setAuthor({ name: 'DHS Application System' })
                    .setTitle('Application Started')
                    .setDescription(`The application process for **${rankName}** has started. Please check your DMs.`)
                    .setTimestamp()
                    .setFooter(FOOTER),
            ],
            flags: MessageFlags.Ephemeral,
        });

        const result = await runDmFlow(interaction.user, rankId, interaction, async (app) => {
            const channel = await interaction.client.channels.fetch(SUBMISSION_CHANNEL).catch(() => null);
            if (!channel) return;

            const subEmbed = createApplicationEmbed(app);
            const msg = await channel.send({
                content: `<@&${STAFF_ROLE}>`,
                embeds: [subEmbed],
                components: [actionButtons(app.id)],
            });

            const saved = db.data.applications.find((a) => a.id === app.id);
            if (saved) { saved.messageId = msg.id; await save(); }
        });

        if (!result.success && result.reason === 'dm_failed') {
            await interaction.followUp({ 
                embeds: [embed(RED, 'Unable to DM you. Please open your DMs and try again.')], 
                flags: MessageFlags.Ephemeral 
            });
        }
    },

    appreview: async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'You do not have permission to review applications.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const appId = interaction.customId.split(':')[1];
        const app = getAppById(appId);
        if (!app) return interaction.reply({ 
            embeds: [embed(RED, 'Application not found.')], 
            flags: MessageFlags.Ephemeral 
        });

        const questions = rankQuestions[app.rankId] ?? [];

        const reviewEmbed = new EmbedBuilder()
            .setColor(DARK)
            .setAuthor({ name: 'Application Review' })
            .setTitle(`Review — ${app.username}`)
            .setThumbnail(app.avatarURL)
            .setDescription(`Reviewing application from <@${app.userId}> for ${rankNames[app.rankId]}.`)
            .addFields(
                { name: 'Applicant', value: `<@${app.userId}>`, inline: true },
                { name: 'Rank', value: rankNames[app.rankId] || 'Unknown', inline: true },
                { name: 'Submitted', value: `<t:${Math.floor(new Date(app.createdAt).getTime() / 1000)}:F>`, inline: false },
                { name: 'Status', value: app.status.charAt(0).toUpperCase() + app.status.slice(1), inline: true }
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
            return interaction.reply({ 
                embeds: [embed(RED, 'You do not have permission to accept applications.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const appId = interaction.customId.split(':')[1];
        const app = getAppById(appId);
        if (!app) return interaction.reply({ 
            embeds: [embed(RED, 'Application not found.')], 
            flags: MessageFlags.Ephemeral 
        });

        if (app.status !== 'pending') {
            return interaction.reply({ 
                embeds: [embed(RED, `This application has already been ${app.status}.`)], 
                flags: MessageFlags.Ephemeral 
            });
        }

        app.status = 'accepted';
        app.reviewedBy = interaction.user.id;
        await save();

        const updatedEmbed = createApplicationEmbed(app);
        await interaction.update({ embeds: [updatedEmbed], components: [actionButtons(appId, true)] });
        
        const channel = interaction.channel;
        await channel.send({ content: `✅ The application from <@${app.userId}> for **${rankNames[app.rankId]}** was accepted by <@${interaction.user.id}>.` });
        
        const user = await interaction.client.users.fetch(app.userId).catch(() => null);
        if (user) {
            await user.send({ embeds: [embed(GREEN, `Your application for **${rankNames[app.rankId]}** has been accepted!`)] }).catch(() => null);
        }
    },

    appdeny: async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'You do not have permission to deny applications.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const appId = interaction.customId.split(':')[1];
        const app = getAppById(appId);
        if (!app) return interaction.reply({ 
            embeds: [embed(RED, 'Application not found.')], 
            flags: MessageFlags.Ephemeral 
        });

        if (app.status !== 'pending') {
            return interaction.reply({ 
                embeds: [embed(RED, `This application has already been ${app.status}.`)], 
                flags: MessageFlags.Ephemeral 
            });
        }

        app.status = 'denied';
        app.reviewedBy = interaction.user.id;
        await save();

        const updatedEmbed = createApplicationEmbed(app);
        await interaction.update({ embeds: [updatedEmbed], components: [actionButtons(appId, true)] });
        
        const channel = interaction.channel;
        await channel.send({ content: `❌ The application from <@${app.userId}> for **${rankNames[app.rankId]}** was denied by <@${interaction.user.id}>.` });
        
        const user = await interaction.client.users.fetch(app.userId).catch(() => null);
        if (user) {
            await user.send({ embeds: [embed(RED, `Your application for **${rankNames[app.rankId]}** has been denied.`)] }).catch(() => null);
        }
    },

    'mgmt:select': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'You do not have permission.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const rankId = interaction.values[0];
        const entry = db.data.enabledRanks.find((r) => r.id === rankId);
        const isEnabled = entry?.enabled ?? false;
        const rankName = rankNames[rankId] || 'Operations Chief';

        const rankEmbed = buildManagementEmbed(rankId);
        
        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mgmt:enable:${rankId}`).setLabel('Enable').setStyle(ButtonStyle.Success).setDisabled(isEnabled),
            new ButtonBuilder().setCustomId(`mgmt:disable:${rankId}`).setLabel('Disable').setStyle(ButtonStyle.Danger).setDisabled(!isEnabled),
            new ButtonBuilder().setCustomId('mgmt:back').setLabel('Back').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [rankEmbed], components: [actionRow] });
    },

    'mgmt:enable': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'You do not have permission.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const rankId = interaction.customId.split(':')[2];
        const existing = db.data.enabledRanks.find((r) => r.id === rankId);
        if (existing) { existing.enabled = true; } else { db.data.enabledRanks.push({ id: rankId, enabled: true }); }
        await save();

        await interaction.update({ 
            embeds: [embed(GREEN, `${rankNames[rankId] || 'Rank'} has been enabled.`), buildManagementEmbed(rankId)], 
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`mgmt:enable:${rankId}`).setLabel('Enable').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId(`mgmt:disable:${rankId}`).setLabel('Disable').setStyle(ButtonStyle.Danger).setDisabled(false),
                new ButtonBuilder().setCustomId('mgmt:back').setLabel('Back').setStyle(ButtonStyle.Secondary)
            )]
        });
    },

    'mgmt:disable': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'You do not have permission.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const rankId = interaction.customId.split(':')[2];
        const existing = db.data.enabledRanks.find((r) => r.id === rankId);
        if (existing) { existing.enabled = false; await save(); }
        
        const rankName = rankNames[rankId] || 'Rank';
        
        const pendingApps = db.data.applications.filter(a => a.rankId === rankId && a.status === 'pending');
        for (const app of pendingApps) {
            const user = await interaction.client.users.fetch(app.userId).catch(() => null);
            if (user) {
                await user.send({ embeds: [embed(RED, `The application for ${rankName} has been disabled. If you believe this is a mistake, please open a ticket.`)] }).catch(() => null);
            }
        }

        await interaction.update({ 
            embeds: [embed(RED, `${rankName} has been disabled.`), buildManagementEmbed(rankId)], 
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`mgmt:enable:${rankId}`).setLabel('Enable').setStyle(ButtonStyle.Success).setDisabled(false),
                new ButtonBuilder().setCustomId(`mgmt:disable:${rankId}`).setLabel('Disable').setStyle(ButtonStyle.Danger).setDisabled(true),
                new ButtonBuilder().setCustomId('mgmt:back').setLabel('Back').setStyle(ButtonStyle.Secondary)
            )]
        });
    },

    'mgmt:back': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'You do not have permission.')], 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        const uniqueRanks = RANKS.filter(rank => rank.id !== OPERATIONS_CHIEF_ROLE);
        
        const selectMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('mgmt:select')
                .setPlaceholder('Select a rank to configure')
                .addOptions([
                    ...uniqueRanks.map((rank) => ({
                        label: rank.name,
                        value: rank.id,
                        description: `Configure ${rank.name}`,
                    }))
                ])
        );
        
        const embed = new EmbedBuilder()
            .setColor(GOLD)
            .setAuthor({ name: 'DHS Application Management' })
            .setTitle('Application System Configuration')
            .setDescription('Select a rank from the dropdown to enable/disable applications for that rank.')
            .setTimestamp()
            .setFooter(FOOTER);
        
        await interaction.update({ embeds: [embed], components: [selectMenu] });
    },
};