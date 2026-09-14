import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Message, TextChannel } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Configura el modo lento del canal actual")
    .addIntegerOption(option =>
        option.setName("segundos")
            .setDescription("Segundos entre mensajes (0 para desactivar, máx. 21600)")
            .setMinValue(0)
            .setMaxValue(21600)
            .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export const permission = PermissionFlagsBits.ManageChannels;

export async function execute(interaction: ChatInputCommandInteraction) {
    const segundos = interaction.options.getInteger("segundos", true);
    const canal = interaction.channel as TextChannel;

    await canal.setRateLimitPerUser(segundos);

    if (segundos === 0) {
        await interaction.reply("🐇 Modo lento desactivado en este canal.");
    } else {
        await interaction.reply(`🐢 Modo lento configurado a **${segundos}s** en este canal.`);
    }
}

export async function executePrefix(message: Message, args: string[]) {
    const segundos = parseInt(args[0] ?? "");
    if (isNaN(segundos) || segundos < 0 || segundos > 21600) {
        await message.reply("❌ Indica los segundos (0-21600). Ejemplo: slowmode 10");
        return;
    }
    const canal = message.channel as TextChannel;

    await canal.setRateLimitPerUser(segundos);

    if (segundos === 0) {
        await message.reply("🐇 Modo lento desactivado en este canal.");
    } else {
        await message.reply(`🐢 Modo lento configurado a **${segundos}s** en este canal.`);
    }
}
