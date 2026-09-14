import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Message } from "discord.js";
import { setPrefix } from "../utils/prefixes.js";

export const data = new SlashCommandBuilder()
    .setName("setprefix")
    .setDescription("Cambia el prefijo de comandos de este servidor")
    .addStringOption(option =>
        option.setName("prefijo").setDescription("Nuevo prefijo (máx. 5 caracteres)").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const permission = PermissionFlagsBits.Administrator;

export async function execute(interaction: ChatInputCommandInteraction) {
    const prefijo = interaction.options.getString("prefijo", true);

    if (prefijo.length > 5) {
        await interaction.reply({ content: "❌ El prefijo no puede tener más de 5 caracteres.", ephemeral: true });
        return;
    }

    await setPrefix(interaction.guildId!, prefijo);
    await interaction.reply(`✅ El prefijo de este servidor ahora es \`${prefijo}\``);
}

export async function executePrefix(message: Message, args: string[]) {
    const prefijo = args[0];

    if (!prefijo) {
        await message.reply("❌ Debes indicar el nuevo prefijo. Ejemplo: setprefix ?");
        return;
    }
    if (prefijo.length > 5) {
        await message.reply("❌ El prefijo no puede tener más de 5 caracteres.");
        return;
    }

    await setPrefix(message.guild!.id, prefijo);
    await message.reply(`✅ El prefijo de este servidor ahora es \`${prefijo}\``);
}
