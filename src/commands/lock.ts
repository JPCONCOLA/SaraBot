import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Message, TextChannel } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Bloquea el canal actual para @everyone")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export const permission = PermissionFlagsBits.ManageChannels;

export async function execute(interaction: ChatInputCommandInteraction) {
    const canal = interaction.channel as TextChannel;
    const everyone = interaction.guild?.roles.everyone;
    if (!everyone) return;

    await canal.permissionOverwrites.edit(everyone, { SendMessages: false });
    await interaction.reply("🔒 Canal bloqueado. Nadie puede enviar mensajes aquí.");
}

export async function executePrefix(message: Message) {
    const canal = message.channel as TextChannel;
    const everyone = message.guild?.roles.everyone;
    if (!everyone) return;

    await canal.permissionOverwrites.edit(everyone, { SendMessages: false });
    await message.reply("🔒 Canal bloqueado. Nadie puede enviar mensajes aquí.");
}
