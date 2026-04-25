export const name = ‘interactionCreate’;
export const once = false;

export async function execute(interaction, commands, buttons) {
if (interaction.isChatInputCommand()) {
const command = commands.get(interaction.commandName);
if (!command) return;

```
try {
  await command.execute(interaction);
} catch (err) {
  console.error(`[Command Error] ${interaction.commandName}:`, err);
  const payload = { content: 'An error occurred.', ephemeral: true };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload).catch(() => null);
  } else {
    await interaction.reply(payload).catch(() => null);
  }
}
return;
```

}

if (interaction.isButton()) {
const handler = buttons.get(interaction.customId);
if (!handler) return;

```
try {
  await handler(interaction);
} catch (err) {
  console.error(`[Button Error] ${interaction.customId}:`, err);
}
```

}
}