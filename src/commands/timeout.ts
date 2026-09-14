import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Message } from "discord.js";
import { resolveUserFromArgs } from "../utils/resolveUser.js";

export const data = new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Silencia temporalmente a un usuario")
    .addUserOption(option =>
        option.setName("usuario").setDescription("Usuario a silenciar").setRequired(true))
    .addIntegerOption(option =>
        option.setName("minutos").setDescription("Duración en minutos (máx. 40320)").setRequired(true))
    .addStringOption(option =>
        option.setName("razon").setDescription("Razón del silencio").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const permission = PermissionFlagsBits.ModerateMembers;

export async function execute(interaction: ChatInputCommandInteraction) {
    const usuario = interaction.options.getUser("usuario", true);
    const minutos = interaction.options.getInteger("minutos", true);
    const razon = interaction.options.getString("razon") ?? "No especificada";

    const miembro = await interaction.guild?.members.fetch(usuario.id).catch(() => null);
    if (!miembro) {
        await interaction.reply({ content: "❌ No encontré a ese usuario en el servidor.", ephemeral: true });
        return;
    }

    if (!miembro.moderatable) {
        await interaction.reply({ content: "❌ No tengo permisos para silenciar a ese usuario.", ephemeral: true });
        return;
    }

    await miembro.timeout(minutos * 60 * 1000, razon);
    await interaction.reply(`🔇 **${usuario.tag}** fue silenciado por ${minutos} minutos. Razón: ${razon}`);
}

export async function executePrefix(message: Message, args: string[]) {
    const usuario = await resolveUserFromArgs(message, args);
    if (!usuario) {
        await message.reply("❌ Debes mencionar a un usuario o dar su ID.");
        return;
    }
    const minutos = parseInt(args[1] ?? "");
    if (isNaN(minutos)) {
        await message.reply("❌ Indica la duración en minutos. Ejemplo: timeout @usuario 10 razón");
        return;
    }
    const razon = args.slice(2).join(" ") || "No especificada";

    const miembro = await message.guild?.members.fetch(usuario.id).catch(() => null);
    if (!miembro) {
        await message.reply("❌ No encontré a ese usuario en el servidor.");
        return;
    }
    if (!miembro.moderatable) {
        await message.reply("❌ No tengo permisos para silenciar a ese usuario.");
        return;
    }

    await miembro.timeout(minutos * 60 * 1000, razon);
    await message.reply(`🔇 **${usuario.tag}** fue silenciado por ${minutos} minutos. Razón: ${razon}`);
}
