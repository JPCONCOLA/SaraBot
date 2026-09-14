import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Message, TextChannel } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Desbloquea el canal actual para @everyone")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export const permission = PermissionFlagsBits.ManageChannels;

export async function execute(interaction: ChatInputCommandInteraction) {
    const canal = interaction.channel as TextChannel;
    const everyone = interaction.guild?.roles.everyone;
    if (!everyone) return;

    await canal.permissionOverwrites.edit(everyone, { SendMessages: null });
    await interaction.reply("🔓 Canal desbloqueado. Ya se puede enviar mensajes aquí.");
}

export async function executePrefix(message: Message) {
    const canal = message.channel as TextChannel;
    const everyone = message.guild?.roles.everyone;
    if (!everyone) return;

    await canal.permissionOverwrites.edit(everyone, { SendMessages: null });
    await message.reply("🔓 Canal desbloqueado. Ya se puede enviar mensajes aquí.");
}
