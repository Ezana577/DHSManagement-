import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from ‘discord.js’;
import { getEnabledRanks, enableRank, disableRank, removeRank } from ‘../database/ranks.js’;
import { STAFF_ROLE, ALL_RANKS } from ‘../utils/config.js’;
import { errorEmbed, managementEmbed } from ‘../utils/embeds.js’;
import { managementSelectMenu, managementActionButtons } from ‘../utils/components.js’;

const Colors = { gold: 0xd4af37 };
const footer = { text: ‘Department of Homeland Security • Application Management’ };

export const data = new SlashCommandBuilder()
.setName(‘application-management’)
.setDescription(‘Manage the DHS application system configuration.’);

export async function execute(interaction) {
if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
return interaction.reply({
embeds: [errorEmbed(‘You do not have permission to use this command.’)],
flags: MessageFlags.Ephemeral,
});
}

const enabledRanks = getEnabledRanks();
const embed = managementEmbed(enabledRanks, ALL_RANKS);
const selectMenu = managementSelectMenu(ALL_RANKS, interaction.guild);

await interaction.reply({
embeds: [embed],
components: [selectMenu],
flags: MessageFlags.Ephemeral,
});
}

export const buttons = {
‘mgmt:enable’: async (interaction) => {
if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
return interaction.reply({
embeds: [errorEmbed(‘You do not have permission.’)],
flags: MessageFlags.Ephemeral,
});
}

```
const rankId = interaction.customId.split(':')[2];
await enableRank(rankId);

const enabledRanks = getEnabledRanks();
const embed = managementEmbed(enabledRanks, ALL_RANKS);
const actionRow = managementActionButtons(rankId, true);
const role = interaction.guild.roles.cache.get(rankId);

await interaction.update({
  embeds: [
    embed,
    new EmbedBuilder()
      .setColor(0x2ecc71)
      .setDescription(`> <@&${rankId}> (${role?.name || rankId}) has been enabled.`)
      .setFooter(footer),
  ],
  components: [actionRow],
});
```

},

‘mgmt:disable’: async (interaction) => {
if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
return interaction.reply({
embeds: [errorEmbed(‘You do not have permission.’)],
flags: MessageFlags.Ephemeral,
});
}

```
const rankId = interaction.customId.split(':')[2];
await disableRank(rankId);

const enabledRanks = getEnabledRanks();
const embed = managementEmbed(enabledRanks, ALL_RANKS);
const actionRow = managementActionButtons(rankId, false);
const role = interaction.guild.roles.cache.get(rankId);

await interaction.update({
  embeds: [
    embed,
    new EmbedBuilder()
      .setColor(0xc0392b)
      .setDescription(`> <@&${rankId}> (${role?.name || rankId}) has been disabled.`)
      .setFooter(footer),
  ],
  components: [actionRow],
});
```

},

‘mgmt:remove’: async (interaction) => {
if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
return interaction.reply({
embeds: [errorEmbed(‘You do not have permission.’)],
flags: MessageFlags.Ephemeral,
});
}

```
const rankId = interaction.customId.split(':')[2];
await removeRank(rankId);

const enabledRanks = getEnabledRanks();
const embed = managementEmbed(enabledRanks, ALL_RANKS);
const selectMenu = managementSelectMenu(ALL_RANKS, interaction.guild);
const role = interaction.guild.roles.cache.get(rankId);

await interaction.update({
  embeds: [
    embed,
    new EmbedBuilder()
      .setColor(0x95a5a6)
      .setDescription(`> <@&${rankId}> (${role?.name || rankId}) has been removed from the system.`)
      .setFooter(footer),
  ],
  components: [selectMenu],
});
```

},

‘mgmt:back’: async (interaction) => {
if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
return interaction.reply({
embeds: [errorEmbed(‘You do not have permission.’)],
flags: MessageFlags.Ephemeral,
});
}

```
const enabledRanks = getEnabledRanks();
const embed = managementEmbed(enabledRanks, ALL_RANKS);
const selectMenu = managementSelectMenu(ALL_RANKS, interaction.guild);

await interaction.update({
  embeds: [embed],
  components: [selectMenu],
});
```

},
};

export const selectMenus = {
‘mgmt:select’: async (interaction) => {
if (!interaction.member.roles.cache.has(STAFF_ROLE)) {
return interaction.reply({
embeds: [errorEmbed(‘You do not have permission.’)],
flags: MessageFlags.Ephemeral,
});
}

```
const rankId = interaction.values[0];
const enabledRanks = getEnabledRanks();
const entry = enabledRanks.find((r) => r.id === rankId);
const isEnabled = entry?.enabled ?? false;

const role = interaction.guild.roles.cache.get(rankId);
const embed = new EmbedBuilder()
  .setColor(Colors.gold)
  .setAuthor({ name: 'DHS Application Management' })
  .setTitle('Rank Configuration')
  .addFields(
    { name: 'Rank', value: `<@&${rankId}>`, inline: true },
    { name: 'Name', value: role?.name || rankId, inline: true },
    { name: 'Status', value: isEnabled ? 'Enabled' : 'Disabled', inline: true }
  )
  .setTimestamp()
  .setFooter(footer);

const actionRow = managementActionButtons(rankId, isEnabled);

await interaction.update({
  embeds: [embed],
  components: [actionRow],
});
```

},
};