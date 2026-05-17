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
const MIN_CHARS = 15;

const rankQuestions = Object.fromEntries(RANKS.map((r) => [r.id, r.questions]));
const rankNames = Object.fromEntries(RANKS.map((r) => [r.id, r.name]));

function embed(color, description) {
    return new EmbedBuilder()
        .setColor(color)
        .setAuthor({ name: 'DHS APPLICATION SYSTEM' })
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

function getAnyPendingApp(userId) {
    return db.data.applications.find(
        (a) => a.userId === userId && a.status === 'pending'
    );
}

function getAppById(id) {
    return db.data.applications.find((a) => a.id === id);
}

function createApplicationEmbed(app, status = null) {
    const embed = new EmbedBuilder()
        .setColor(app.status === 'accepted' ? GREEN : app.status === 'denied' ? RED : GOLD)
        .setAuthor({ name: 'DHS APPLICATION SYSTEM' })
        .setTitle(`APPLICATION FOR ${rankNames[app.rankId] || 'UNKNOWN RANK'}`)
        .setThumbnail(app.avatarURL)
        .setDescription(`<@${app.userId}> HAS SUBMITTED AN APPLICATION.`)
        .addFields(
            { name: 'USER', value: `<@${app.userId}>`, inline: true },
            { name: 'ROLE APPLIED', value: rankNames[app.rankId] || 'UNKNOWN', inline: true },
            { name: 'SUBMITTED', value: `<t:${Math.floor(new Date(app.createdAt).getTime() / 1000)}:F>`, inline: false },
            { name: 'STATUS', value: app.status.charAt(0).toUpperCase() + app.status.slice(1), inline: true }
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
            .setAuthor({ name: 'DHS APPLICATION SYSTEM' })
            .setDescription('THERE ARE CURRENTLY NO APPLICATIONS OPEN AT THE MOMENT!')
            .setTimestamp()
            .setFooter(FOOTER);
    }
    
    const rankList = active.map(r => `• ${rankNames[r.id] || r.id}`).join('\n');
    
    return new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: 'DHS APPLICATION SYSTEM' })
        .setDescription(`BELOW ARE THE CURRENT APPLICATIONS AVAILABLE AT THE MOMENT. YOU MAY APPLY FOR MORE THAN ONE RANK. IF YOU GET ACCEPTED INTO MULTIPLE, YOU WILL BE PLACED INTO THE HIGHEST ONE.\n\n**AVAILABLE RANKS:**\n${rankList}\n\nSELECT A RANK FROM THE DROPDOWN BELOW TO BEGIN.`)
        .setTimestamp()
        .setFooter(FOOTER);
}

function createRankSelectMenu() {
    const active = getEnabledRanks();
    
    if (active.length === 0) return null;
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('apply_select')
            .setPlaceholder('SELECT A RANK TO APPLY FOR...')
            .addOptions(
                active.map((rank) => ({
                    label: rankNames[rank.id] || rank.id,
                    value: rank.id,
                    description: `APPLY FOR ${rankNames[rank.id] || rank.id} POSITION`,
                }))
            )
    );
}

function actionButtons(appId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`appreview:${appId}`).setLabel('REVIEW').setStyle(ButtonStyle.Primary).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`appaccept:${appId}`).setLabel('ACCEPT').setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`appdeny:${appId}`).setLabel('DENY').setStyle(ButtonStyle.Danger).setDisabled(disabled)
    );
}

async function runDmFlow(user, rankId, interaction, onComplete) {
    const questions = rankQuestions[rankId];
    const rankName = rankNames[rankId];

    let dm;
    try { dm = await user.createDM(); }
    catch { return { success: false, reason: 'dm_failed' }; }

    const existingApp = getAnyPendingApp(user.id);
    if (existingApp) {
        await dm.send({ embeds: [embed(RED, `YOU ALREADY HAVE A PENDING APPLICATION FOR ${rankNames[existingApp.rankId]}. PLEASE COMPLETE OR CANCEL THAT APPLICATION BEFORE STARTING A NEW ONE.`)] }).catch(() => null);
        return { success: false, reason: 'existing_app' };
    }

    if (!questions?.length) {
        await dm.send({ embeds: [embed(RED, 'THIS APPLICATION IS NOT CURRENTLY SET UP. PLEASE CONTACT STAFF.')] }).catch(() => null);
        return { success: false, reason: 'no_questions' };
    }

    const checkIfStillEnabled = () => {
        const entry = db.data.enabledRanks.find((r) => r.id === rankId && r.enabled);
        return !!entry;
    };

    const answers = [];

    for (let i = 0; i < questions.length; i++) {
        if (!checkIfStillEnabled()) {
            await dm.send({ embeds: [embed(RED, `THE APPLICATION FOR ${rankName} HAS BEEN DISABLED. IF YOU BELIEVE THIS IS A MISTAKE, PLEASE OPEN A TICKET.`)] }).catch(() => null);
            return { success: false, reason: 'disabled' };
        }

        const q = questions[i];
        const isChoice = q.type === 'choice';

        const qEmbed = new EmbedBuilder()
            .setColor(GOLD)
            .setAuthor({ name: 'DHS APPLICATION SYSTEM' })
            .setTitle(`QUESTION ${i + 1} OF ${questions.length}`)
            .setDescription(q.prompt)
            .setFooter({ text: `${FOOTER.text} — ${isChoice ? 'SELECT AN OPTION BELOW' : `TYPE YOUR ANSWER BELOW (MINIMUM ${MIN_CHARS} CHARACTERS)`}` });

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
                await dm.send({ embeds: [embed(RED, 'YOUR APPLICATION TIMED OUT. PLEASE RESTART.')] }).catch(() => null);
                return { success: false, reason: 'timeout' };
            }

            answers.push({ questionId: q.id, value: chosen });

        } else {
            let validAnswer = false;
            let answer = '';
            
            while (!validAnswer) {
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
                    await dm.send({ embeds: [embed(RED, 'YOUR APPLICATION TIMED OUT. PLEASE RESTART.')] }).catch(() => null);
                    return { success: false, reason: 'timeout' };
                }

                answer = collected.first().content.trim();
                
                if (answer.length < MIN_CHARS) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor(RED)
                        .setAuthor({ name: 'DHS APPLICATION SYSTEM' })
                        .setDescription(`YOUR ANSWER IS TOO SHORT! (${answer.length}/${MIN_CHARS} CHARACTERS)\n\nPLEASE PROVIDE A MORE DETAILED RESPONSE WITH AT LEAST ${MIN_CHARS} CHARACTERS.`)
                        .setTimestamp()
                        .setFooter(FOOTER);
                    await dm.send({ embeds: [errorEmbed] }).catch(() => null);
                } else {
                    validAnswer = true;
                }
            }
            
            answers.push({ questionId: q.id, value: answer });
            
            const confirmEmbed = new EmbedBuilder()
                .setColor(GREEN)
                .setAuthor({ name: 'DHS APPLICATION SYSTEM' })
                .setDescription(`YOUR RESPONSE HAS BEEN SAVED:\n> ${answer}`)
                .setTimestamp()
                .setFooter(FOOTER);
            
            await dm.send({ embeds: [confirmEmbed] }).catch(() => null);
        }
    }

    if (!checkIfStillEnabled()) {
        await dm.send({ embeds: [embed(RED, `THE APPLICATION FOR ${rankName} HAS BEEN DISABLED. IF YOU BELIEVE THIS IS A MISTAKE, PLEASE OPEN A TICKET.`)] }).catch(() => null);
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
        .setAuthor({ name: 'DHS APPLICATION SYSTEM' })
        .setTitle('APPLICATION SUBMITTED')
        .setDescription('YOUR APPLICATION HAS BEEN SUBMITTED. HERE IS A SUMMARY OF YOUR RESPONSES.')
        .setTimestamp()
        .setFooter(FOOTER);

    for (const q of questions) {
        const ans = answers.find((a) => a.questionId === q.id);
        summaryEmbed.addFields({ name: q.prompt, value: ans?.value || '*NO RESPONSE*', inline: false });
    }

    await dm.send({ embeds: [summaryEmbed] }).catch(() => null);
    await onComplete(app);

    return { success: true, app };
}

export const data = new SlashCommandBuilder()
    .setName('application')
    .setDescription('SEND APPLICATION DASHBOARD.');

export async function execute(interaction) {
    if (!interaction.member.roles.cache.has(DASHBOARD_ROLE)) {
        return interaction.reply({ 
            embeds: [embed(RED, 'YOU DO NOT HAVE PERMISSION TO USE THIS COMMAND.')], 
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
    .setDescription('MANAGE THE DHS APPLICATION SYSTEM CONFIGURATION.');

export async function managementExecute(interaction) {
    if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
        return interaction.reply({ 
            embeds: [embed(RED, 'YOU DO NOT HAVE PERMISSION TO USE THIS COMMAND.')], 
            flags: MessageFlags.Ephemeral 
        });
    }

    const uniqueRanks = RANKS.filter(rank => rank.id !== OPERATIONS_CHIEF_ROLE);

    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('mgmt:select')
            .setPlaceholder('SELECT A RANK TO CONFIGURE')
            .addOptions([
                ...uniqueRanks.map((rank) => ({
                    label: rank.name,
                    value: rank.id,
                    description: `CONFIGURE ${rank.name}`,
                }))
            ])
    );

    const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: 'DHS APPLICATION MANAGEMENT' })
        .setTitle('APPLICATION SYSTEM CONFIGURATION')
        .setDescription('SELECT A RANK FROM THE DROPDOWN TO ENABLE/DISABLE APPLICATIONS FOR THAT RANK.')
        .setTimestamp()
        .setFooter(FOOTER);

    await interaction.reply({ embeds: [embed], components: [selectMenu], flags: MessageFlags.Ephemeral });
}

function buildManagementEmbed(rankId) {
    const entry = db.data.enabledRanks.find((r) => r.id === rankId);
    const isEnabled = entry?.enabled ?? false;
    const rankName = rankNames[rankId] || 'UNKNOWN RANK';
    
    return new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: 'DHS APPLICATION MANAGEMENT' })
        .setTitle(`CONFIGURE ${rankName}`)
        .addFields(
            { name: 'RANK', value: rankName, inline: true },
            { name: 'STATUS', value: isEnabled ? 'ENABLED' : 'DISABLED', inline: true }
        )
        .setTimestamp()
        .setFooter(FOOTER);
}

export const buttons = {
    'apply_select': async (interaction) => {
        const rankId = interaction.values[0];
        const rankName = rankNames[rankId];

        const existingPending = getAnyPendingApp(interaction.user.id);
        if (existingPending) {
            return interaction.reply({ 
                embeds: [embed(RED, `YOU ALREADY HAVE A PENDING APPLICATION FOR ${rankNames[existingPending.rankId]}. PLEASE COMPLETE OR CANCEL THAT APPLICATION BEFORE STARTING A NEW ONE.`)], 
                flags: MessageFlags.Ephemeral 
            });
        }

        if (getPendingApp(interaction.user.id, rankId)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'YOU ALREADY HAVE A PENDING APPLICATION FOR THIS RANK.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const entry = db.data.enabledRanks.find((r) => r.id === rankId && r.enabled);
        if (!entry) {
            return interaction.reply({ 
                embeds: [embed(RED, 'THIS RANK IS NO LONGER AVAILABLE FOR APPLICATION.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(GOLD)
                    .setAuthor({ name: 'DHS APPLICATION SYSTEM' })
                    .setTitle('APPLICATION STARTED')
                    .setDescription(`THE APPLICATION PROCESS FOR **${rankName}** HAS STARTED. PLEASE CHECK YOUR DMS.`)
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
                embeds: [embed(RED, 'UNABLE TO DM YOU. PLEASE OPEN YOUR DMS AND TRY AGAIN.')], 
                flags: MessageFlags.Ephemeral 
            });
        }
    },

    appreview: async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'YOU DO NOT HAVE PERMISSION TO REVIEW APPLICATIONS.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const appId = interaction.customId.split(':')[1];
        const app = getAppById(appId);
        if (!app) return interaction.reply({ 
            embeds: [embed(RED, 'APPLICATION NOT FOUND.')], 
            flags: MessageFlags.Ephemeral 
        });

        const questions = rankQuestions[app.rankId] ?? [];

        const reviewEmbed = new EmbedBuilder()
            .setColor(DARK)
            .setAuthor({ name: 'APPLICATION REVIEW' })
            .setTitle(`REVIEW — ${app.username}`)
            .setThumbnail(app.avatarURL)
            .setDescription(`REVIEWING APPLICATION FROM <@${app.userId}> FOR ${rankNames[app.rankId]}.`)
            .addFields(
                { name: 'APPLICANT', value: `<@${app.userId}>`, inline: true },
                { name: 'RANK', value: rankNames[app.rankId] || 'UNKNOWN', inline: true },
                { name: 'SUBMITTED', value: `<t:${Math.floor(new Date(app.createdAt).getTime() / 1000)}:F>`, inline: false },
                { name: 'STATUS', value: app.status.charAt(0).toUpperCase() + app.status.slice(1), inline: true }
            )
            .setTimestamp()
            .setFooter(FOOTER);

        for (const q of questions) {
            const ans = app.answers.find((a) => a.questionId === q.id);
            reviewEmbed.addFields({ name: q.prompt, value: ans?.value ?? '_NO RESPONSE_', inline: false });
        }

        return interaction.reply({ embeds: [reviewEmbed], flags: MessageFlags.Ephemeral });
    },

    appaccept: async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'YOU DO NOT HAVE PERMISSION TO ACCEPT APPLICATIONS.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const appId = interaction.customId.split(':')[1];
        const app = getAppById(appId);
        if (!app) return interaction.reply({ 
            embeds: [embed(RED, 'APPLICATION NOT FOUND.')], 
            flags: MessageFlags.Ephemeral 
        });

        if (app.status !== 'pending') {
            return interaction.reply({ 
                embeds: [embed(RED, `THIS APPLICATION HAS ALREADY BEEN ${app.status.toUpperCase()}.`)], 
                flags: MessageFlags.Ephemeral 
            });
        }

        app.status = 'accepted';
        app.reviewedBy = interaction.user.id;
        await save();

        const updatedEmbed = createApplicationEmbed(app);
        await interaction.update({ embeds: [updatedEmbed], components: [actionButtons(appId, true)] });
        
        const channel = interaction.channel;
        const acceptEmbed = new EmbedBuilder()
            .setColor(GREEN)
            .setAuthor({ name: 'DHS APPLICATION SYSTEM' })
            .setTitle('APPLICATION ACCEPTED')
            .setDescription(`THE APPLICATION FROM <@${app.userId}> FOR **${rankNames[app.rankId]}** WAS ACCEPTED BY <@${interaction.user.id}>.`)
            .setTimestamp()
            .setFooter(FOOTER);
        
        await channel.send({ embeds: [acceptEmbed] });
        
        const user = await interaction.client.users.fetch(app.userId).catch(() => null);
        if (user) {
            await user.send({ embeds: [embed(GREEN, `YOUR APPLICATION FOR **${rankNames[app.rankId]}** HAS BEEN ACCEPTED!`)] }).catch(() => null);
        }
    },

    appdeny: async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'YOU DO NOT HAVE PERMISSION TO DENY APPLICATIONS.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const appId = interaction.customId.split(':')[1];
        const app = getAppById(appId);
        if (!app) return interaction.reply({ 
            embeds: [embed(RED, 'APPLICATION NOT FOUND.')], 
            flags: MessageFlags.Ephemeral 
        });

        if (app.status !== 'pending') {
            return interaction.reply({ 
                embeds: [embed(RED, `THIS APPLICATION HAS ALREADY BEEN ${app.status.toUpperCase()}.`)], 
                flags: MessageFlags.Ephemeral 
            });
        }

        app.status = 'denied';
        app.reviewedBy = interaction.user.id;
        await save();

        const updatedEmbed = createApplicationEmbed(app);
        await interaction.update({ embeds: [updatedEmbed], components: [actionButtons(appId, true)] });
        
        const channel = interaction.channel;
        const denyEmbed = new EmbedBuilder()
            .setColor(RED)
            .setAuthor({ name: 'DHS APPLICATION SYSTEM' })
            .setTitle('APPLICATION DENIED')
            .setDescription(`THE APPLICATION FROM <@${app.userId}> FOR **${rankNames[app.rankId]}** WAS DENIED BY <@${interaction.user.id}>.`)
            .setTimestamp()
            .setFooter(FOOTER);
        
        await channel.send({ embeds: [denyEmbed] });
        
        const user = await interaction.client.users.fetch(app.userId).catch(() => null);
        if (user) {
            await user.send({ embeds: [embed(RED, `YOUR APPLICATION FOR **${rankNames[app.rankId]}** HAS BEEN DENIED.`)] }).catch(() => null);
        }
    },

    'mgmt:select': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'YOU DO NOT HAVE PERMISSION.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const rankId = interaction.values[0];
        const entry = db.data.enabledRanks.find((r) => r.id === rankId);
        const isEnabled = entry?.enabled ?? false;
        const rankName = rankNames[rankId] || 'OPERATIONS CHIEF';

        const rankEmbed = buildManagementEmbed(rankId);
        
        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mgmt:enable:${rankId}`).setLabel('ENABLE').setStyle(ButtonStyle.Success).setDisabled(isEnabled),
            new ButtonBuilder().setCustomId(`mgmt:disable:${rankId}`).setLabel('DISABLE').setStyle(ButtonStyle.Danger).setDisabled(!isEnabled),
            new ButtonBuilder().setCustomId('mgmt:back').setLabel('BACK').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [rankEmbed], components: [actionRow] });
    },

    'mgmt:enable': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'YOU DO NOT HAVE PERMISSION.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const rankId = interaction.customId.split(':')[2];
        const existing = db.data.enabledRanks.find((r) => r.id === rankId);
        if (existing) { existing.enabled = true; } else { db.data.enabledRanks.push({ id: rankId, enabled: true }); }
        await save();

        await interaction.update({ 
            embeds: [embed(GREEN, `${rankNames[rankId] || 'RANK'} HAS BEEN ENABLED.`), buildManagementEmbed(rankId)], 
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`mgmt:enable:${rankId}`).setLabel('ENABLE').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId(`mgmt:disable:${rankId}`).setLabel('DISABLE').setStyle(ButtonStyle.Danger).setDisabled(false),
                new ButtonBuilder().setCustomId('mgmt:back').setLabel('BACK').setStyle(ButtonStyle.Secondary)
            )]
        });
    },

    'mgmt:disable': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'YOU DO NOT HAVE PERMISSION.')], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const rankId = interaction.customId.split(':')[2];
        const existing = db.data.enabledRanks.find((r) => r.id === rankId);
        if (existing) { existing.enabled = false; await save(); }
        
        const rankName = rankNames[rankId] || 'RANK';
        
        const pendingApps = db.data.applications.filter(a => a.rankId === rankId && a.status === 'pending');
        for (const app of pendingApps) {
            const user = await interaction.client.users.fetch(app.userId).catch(() => null);
            if (user) {
                await user.send({ embeds: [embed(RED, `THE APPLICATION FOR ${rankName} HAS BEEN DISABLED. IF YOU BELIEVE THIS IS A MISTAKE, PLEASE OPEN A TICKET.`)] }).catch(() => null);
            }
        }

        await interaction.update({ 
            embeds: [embed(RED, `${rankName} HAS BEEN DISABLED.`), buildManagementEmbed(rankId)], 
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`mgmt:enable:${rankId}`).setLabel('ENABLE').setStyle(ButtonStyle.Success).setDisabled(false),
                new ButtonBuilder().setCustomId(`mgmt:disable:${rankId}`).setLabel('DISABLE').setStyle(ButtonStyle.Danger).setDisabled(true),
                new ButtonBuilder().setCustomId('mgmt:back').setLabel('BACK').setStyle(ButtonStyle.Secondary)
            )]
        });
    },

    'mgmt:back': async (interaction) => {
        if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
            return interaction.reply({ 
                embeds: [embed(RED, 'YOU DO NOT HAVE PERMISSION.')], 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        const uniqueRanks = RANKS.filter(rank => rank.id !== OPERATIONS_CHIEF_ROLE);
        
        const selectMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('mgmt:select')
                .setPlaceholder('SELECT A RANK TO CONFIGURE')
                .addOptions([
                    ...uniqueRanks.map((rank) => ({
                        label: rank.name,
                        value: rank.id,
                        description: `CONFIGURE ${rank.name}`,
                    }))
                ])
        );
        
        const embed = new EmbedBuilder()
            .setColor(GOLD)
            .setAuthor({ name: 'DHS APPLICATION MANAGEMENT' })
            .setTitle('APPLICATION SYSTEM CONFIGURATION')
            .setDescription('SELECT A RANK FROM THE DROPDOWN TO ENABLE/DISABLE APPLICATIONS FOR THAT RANK.')
            .setTimestamp()
            .setFooter(FOOTER);
        
        await interaction.update({ embeds: [embed], components: [selectMenu] });
    },
};