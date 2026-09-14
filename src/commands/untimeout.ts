import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Message } from "discord.js";
import { resolveUserFromArgs } from "../utils/resolveUser.js";

export const data = new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Quita el silencio a un usuario")
    .addUserOption(option =>
        option.setName("usuario").setDescription("Usuario a des-silenciar").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const permission = PermissionFlagsBits.ModerateMembers;

export async function execute(interaction: ChatInputCommandInteraction) {
    const usuario = interaction.options.getUser("usuario", true);

    const miembro = await interaction.guild?.members.fetch(usuario.id).catch(() => null);
    if (!miembro) {
        await interaction.reply({ content: "❌ No encontré a ese usuario en el servidor.", ephemeral: true });
        return;
    }

    await miembro.timeout(null);
    await interaction.reply(`🔊 **${usuario.tag}** ya no está silenciado.`);
}

export async function executePrefix(message: Message, args: string[]) {
    const usuario = await resolveUserFromArgs(message, args);
    if (!usuario) {
        await message.reply("❌ Debes mencionar a un usuario o dar su ID.");
        return;
    }

    const miembro = await message.guild?.members.fetch(usuario.id).catch(() => null);
    if (!miembro) {
        await message.reply("❌ No encontré a ese usuario en el servidor.");
        return;
    }

    await miembro.timeout(null);
    await message.reply(`🔊 **${usuario.tag}** ya no está silenciado.`);
}
