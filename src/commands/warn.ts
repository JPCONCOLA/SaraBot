import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Message } from "discord.js";
import { resolveUserFromArgs } from "../utils/resolveUser.js";

export const data = new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Envía una advertencia a un usuario")
    .addUserOption(option =>
        option.setName("usuario").setDescription("Usuario a advertir").setRequired(true))
    .addStringOption(option =>
        option.setName("razon").setDescription("Razón de la advertencia").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export const permission = PermissionFlagsBits.ModerateMembers;

export async function execute(interaction: ChatInputCommandInteraction) {
    const usuario = interaction.options.getUser("usuario", true);
    const razon = interaction.options.getString("razon", true);

    await usuario.send(`⚠️ Has recibido una advertencia en **${interaction.guild?.name}**. Razón: ${razon}`)
        .catch(() => null);

    await interaction.reply(`⚠️ **${usuario.tag}** fue advertido. Razón: ${razon}`);
}

export async function executePrefix(message: Message, args: string[]) {
    const usuario = await resolveUserFromArgs(message, args);
    if (!usuario) {
        await message.reply("❌ Debes mencionar a un usuario o dar su ID.");
        return;
    }
    const razon = args.slice(1).join(" ");
    if (!razon) {
        await message.reply("❌ Debes indicar la razón de la advertencia.");
        return;
    }

    await usuario.send(`⚠️ Has recibido una advertencia en **${message.guild?.name}**. Razón: ${razon}`)
        .catch(() => null);

    await message.reply(`⚠️ **${usuario.tag}** fue advertido. Razón: ${razon}`);
}
