export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction, commands, buttons, modals) {
    if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;
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
    }

    if (interaction.isButton()) {
        const parts = interaction.customId.split(':');
        const handler =
            buttons.get(interaction.customId) ??
            buttons.get(parts.slice(0, 2).join(':')) ??
            buttons.get(parts[0]);
        if (!handler) return;
        try {
            await handler(interaction);
        } catch (err) {
            console.error(`[Button Error] ${interaction.customId}:`, err);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred.', ephemeral: true }).catch(() => null);
            }
        }
        return;
    }

    if (interaction.isStringSelectMenu()) {
        const parts = interaction.customId.split(':');
        const handler =
            buttons.get(interaction.customId) ??
            buttons.get(parts.slice(0, 2).join(':')) ??
            buttons.get(parts[0]);
        if (!handler) return;
        try {
            await handler(interaction);
        } catch (err) {
            console.error(`[SelectMenu Error] ${interaction.customId}:`, err);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'An error occurred.', ephemeral: true }).catch(() => null);
            }
        }
        return;
    }

    if (interaction.isModalSubmit()) {
        const baseId = interaction.customId.split(':')[0];
        const handler = modals.get(interaction.customId) ?? modals.get(baseId);
        if (!handler) return;
        try {
            await handler(interaction);
        } catch (err) {
            console.error(`[Modal Error] ${interaction.customId}:`, err);
        }
    }
}