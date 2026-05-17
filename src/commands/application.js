import { SlashCommandBuilder, MessageFlags } from ‘discord.js’;
import { getEnabledRanks } from ‘../database/ranks.js’;
import { getApplication } from ‘../database/applications.js’;
import { DASHBOARD_ROLE, RANK_QUESTIONS, SUBMISSION_CHANNEL } from ‘../utils/config.js’;
import { errorEmbed, dashboardEmbed, submissionEmbed } from ‘../utils/embeds.js’;
import { rankButtonsWithNames, applicationActionButtons, disabledActionButtons } from ‘../utils/components.js’;
import { runDmFlow } from ‘../handlers/dmFlow.js’;
import { setApplicationMessageId, updateApplicationStatus } from ‘../database/applications.js’;
import { getApplicationById } from ‘../database/applications.js’;
import { reviewEmbed } from ‘../utils/embeds.js’;
import { STAFF_ROLE } from ‘../utils/config.js’;

export const data = new SlashCommandBuilder()
.setName(‘application’)
.setDescription(‘Open the DHS application dashboard.’);

export async function execute(interaction) {
if (!interaction.member.roles.cache.has(DASHBOARD_ROLE)) {
return interaction.reply({
embeds: [errorEmbed(‘You do not have permission to use this command.’)],
flags: MessageFlags.Ephemeral,
});
}

const enabledRanks = getEnabledRanks();
const active = enabledRanks.filter((r) => r.enabled);

if (active.length === 0) {
return interaction.reply({
embeds: [errorEmbed(‘There are no ranks currently available for application.’)],
flags: MessageFlags.Ephemeral,
});
}

const rows = rankButtonsWithNames(enabledRanks, interaction.guild);

await interaction.reply({
embeds: [dashboardEmbed()],
components: rows,
});
}

export const buttons = {
apply: async (interaction) => {
const rankId = interaction.customId.split(’:’)[1];

```
const existing = getApplication(interaction.user.id, rankId);
if (existing) {
  return interaction.reply({
    embeds: [errorEmbed('You already have a pending application for this rank.')],
    flags: MessageFlags.Ephemeral,
  });
}

const enabledRanks = getEnabledRanks();
const rankEntry = enabledRanks.find((r) => r.id === rankId && r.enabled);
if (!rankEntry) {
  return interaction.reply({
    embeds: [errorEmbed('This rank is no longer available for application.')],
    flags: MessageFlags.Ephemeral,
  });
}

await interaction.reply({
  embeds: [errorEmbed(`The application process for <@&${rankId}> has started. Please check your DMs.`)
    .setColor(0xd4af37)
    .setTitle('Application Started')
    .setDescription(`The application process for <@&${rankId}> has started. Please check your DMs.`)],
  flags: MessageFlags.Ephemeral,
});

const guild = interaction.guild;

const result = await runDmFlow(interaction.user, rankId, guild, async (app) => {
  const channel = await interaction.client.channels.fetch(SUBMISSION_CHANNEL).catch(() => null);
  if (!channel) return;

  const embed = submissionEmbed({
    user: interaction.user,
    rankId,
    appId: app.id,
    avatarURL: app.avatarURL,
  });

  const actionRow = applicationActionButtons(app.id);

  const msg = await channel.send({
    content: `<@${interaction.user.id}>`,
    embeds: [embed],
    components: [actionRow],
  });

  await setApplicationMessageId(app.id, msg.id);
});

if (!result.success && result.reason === 'dm_failed') {
  await interaction.followUp({
    embeds: [errorEmbed('Unable to send you a DM. Please ensure your DMs are open and try again.')],
    flags: MessageFlags.Ephemeral,
  });
}
```

},

appreview: async (interaction) => {
if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
return interaction.reply({
embeds: [errorEmbed(‘You do not have permission to review applications.’)],
flags: MessageFlags.Ephemeral,
});
}

```
const appId = interaction.customId.split(':')[1];
const app = getApplicationById(appId);

if (!app) {
  return interaction.reply({
    embeds: [errorEmbed('Application not found.')],
    flags: MessageFlags.Ephemeral,
  });
}

const questions = RANK_QUESTIONS[app.rankId] || [];

return interaction.reply({
  embeds: [reviewEmbed({ app, questions })],
  flags: MessageFlags.Ephemeral,
});
```

},

appaccept: async (interaction) => {
if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
return interaction.reply({
embeds: [errorEmbed(‘You do not have permission to accept applications.’)],
flags: MessageFlags.Ephemeral,
});
}

```
const appId = interaction.customId.split(':')[1];
const app = getApplicationById(appId);

if (!app) {
  return interaction.reply({
    embeds: [errorEmbed('Application not found.')],
    flags: MessageFlags.Ephemeral,
  });
}

if (app.status !== 'pending') {
  return interaction.reply({
    embeds: [errorEmbed(`This application has already been ${app.status}.`)],
    flags: MessageFlags.Ephemeral,
  });
}

await updateApplicationStatus(appId, 'accepted', interaction.user.id);

const disabledRow = disabledActionButtons(appId);
await interaction.update({ components: [disabledRow] });

await interaction.channel.send({
  content: `The application from <@${app.userId}> for <@&${app.rankId}> was accepted by <@${interaction.user.id}>.`,
});
```

},

appdeny: async (interaction) => {
if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
return interaction.reply({
embeds: [errorEmbed(‘You do not have permission to deny applications.’)],
flags: MessageFlags.Ephemeral,
});
}

```
const appId = interaction.customId.split(':')[1];
const app = getApplicationById(appId);

if (!app) {
  return interaction.reply({
    embeds: [errorEmbed('Application not found.')],
    flags: MessageFlags.Ephemeral,
  });
}

if (app.status !== 'pending') {
  return interaction.reply({
    embeds: [errorEmbed(`This application has already been ${app.status}.`)],
    flags: MessageFlags.Ephemeral,
  });
}

await updateApplicationStatus(appId, 'denied', interaction.user.id);

const disabledRow = disabledActionButtons(appId);
await interaction.update({ components: [disabledRow] });

await interaction.channel.send({
  content: `The application from <@${app.userId}> for <@&${app.rankId}> was denied by <@${interaction.user.id}>.`,
});
```

},
};