import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Message } from "discord.js";
import { resolveUserFromArgs } from "../utils/resolveUser.js";

export const data = new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banea a un usuario del servidor")
    .addUserOption(option =>
        option.setName("usuario").setDescription("Usuario a banear").setRequired(true))
    .addStringOption(option =>
        option.setName("razon").setDescription("Razón del baneo").setRequired(false))
    .addIntegerOption(option =>
        option.setName("dias_borrado")
            .setDescription("Días de mensajes a borrar (0-7)")
            .setMinValue(0)
            .setMaxValue(7)
            .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export const permission = PermissionFlagsBits.BanMembers;

export async function execute(interaction: ChatInputCommandInteraction) {
    const usuario = interaction.options.getUser("usuario", true);
    const razon = interaction.options.getString("razon") ?? "No especificada";
    const dias = interaction.options.getInteger("dias_borrado") ?? 0;

    const miembro = await interaction.guild?.members.fetch(usuario.id).catch(() => null);
    if (miembro && !miembro.bannable) {
        await interaction.reply({ content: "❌ No tengo permisos para banear a ese usuario.", ephemeral: true });
        return;
    }

    await interaction.guild?.members.ban(usuario.id, { deleteMessageSeconds: dias * 86400, reason: razon });
    await interaction.reply(`🔨 **${usuario.tag}** fue baneado. Razón: ${razon}`);
}

export async function executePrefix(message: Message, args: string[]) {
    const usuario = await resolveUserFromArgs(message, args);
    if (!usuario) {
        await message.reply("❌ Debes mencionar a un usuario o dar su ID.");
        return;
    }
    const razon = args.slice(1).join(" ") || "No especificada";

    const miembro = await message.guild?.members.fetch(usuario.id).catch(() => null);
    if (miembro && !miembro.bannable) {
        await message.reply("❌ No tengo permisos para banear a ese usuario.");
        return;
    }

    // El borrado de mensajes por días solo está disponible en la versión slash
    await message.guild?.members.ban(usuario.id, { reason: razon });
    await message.reply(`🔨 **${usuario.tag}** fue baneado. Razón: ${razon}`);
}
