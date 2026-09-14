import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Message } from "discord.js";
import { resolveUserFromArgs } from "../utils/resolveUser.js";

export const data = new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa a un usuario del servidor")
    .addUserOption(option =>
        option.setName("usuario").setDescription("Usuario a expulsar").setRequired(true))
    .addStringOption(option =>
        option.setName("razon").setDescription("Razón de la expulsión").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

export const permission = PermissionFlagsBits.KickMembers;

export async function execute(interaction: ChatInputCommandInteraction) {
    const usuario = interaction.options.getUser("usuario", true);
    const razon = interaction.options.getString("razon") ?? "No especificada";

    const miembro = await interaction.guild?.members.fetch(usuario.id).catch(() => null);
    if (!miembro) {
        await interaction.reply({ content: "❌ No encontré a ese usuario en el servidor.", ephemeral: true });
        return;
    }

    if (!miembro.kickable) {
        await interaction.reply({ content: "❌ No tengo permisos para expulsar a ese usuario.", ephemeral: true });
        return;
    }

    await miembro.kick(razon);
    await interaction.reply(`✅ **${usuario.tag}** fue expulsado. Razón: ${razon}`);
}

export async function executePrefix(message: Message, args: string[]) {
    const usuario = await resolveUserFromArgs(message, args);
    if (!usuario) {
        await message.reply("❌ Debes mencionar a un usuario o dar su ID.");
        return;
    }
    const razon = args.slice(1).join(" ") || "No especificada";

    const miembro = await message.guild?.members.fetch(usuario.id).catch(() => null);
    if (!miembro) {
        await message.reply("❌ No encontré a ese usuario en el servidor.");
        return;
    }
    if (!miembro.kickable) {
        await message.reply("❌ No tengo permisos para expulsar a ese usuario.");
        return;
    }

    await miembro.kick(razon);
    await message.reply(`✅ **${usuario.tag}** fue expulsado. Razón: ${razon}`);
}
