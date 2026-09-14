import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Message } from "discord.js";

export const data = new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Quita el baneo a un usuario mediante su ID")
    .addStringOption(option =>
        option.setName("id").setDescription("ID del usuario a desbanear").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export const permission = PermissionFlagsBits.BanMembers;

export async function execute(interaction: ChatInputCommandInteraction) {
    const id = interaction.options.getString("id", true);

    const baneado = await interaction.guild?.bans.fetch(id).catch(() => null);
    if (!baneado) {
        await interaction.reply({ content: "❌ Ese usuario no está baneado o el ID es inválido.", ephemeral: true });
        return;
    }

    await interaction.guild?.members.unban(id);
    await interaction.reply(`✅ **${baneado.user.tag}** fue desbaneado.`);
}

export async function executePrefix(message: Message, args: string[]) {
    const id = args[0];
    if (!id) {
        await message.reply("❌ Debes indicar el ID del usuario a desbanear.");
        return;
    }

    const baneado = await message.guild?.bans.fetch(id).catch(() => null);
    if (!baneado) {
        await message.reply("❌ Ese usuario no está baneado o el ID es inválido.");
        return;
    }

    await message.guild?.members.unban(id);
    await message.reply(`✅ **${baneado.user.tag}** fue desbaneado.`);
}
