import { ChatInputCommandInteraction, EmbedBuilder, Message, SlashCommandBuilder } from "discord.js";
import { getLevel, xpForLevel } from "../utils/levels.js";

export const data = new SlashCommandBuilder().setName("rank").setDescription("Muestra tu nivel en el servidor").addUserOption(option => option.setName("usuario").setDescription("Usuario a consultar"));

async function rank(guildId: string, user: { id: string; username: string; displayAvatarURL: () => string }) {
    const row = await getLevel(guildId, user.id);
    const current = xpForLevel(row.level);
    const next = xpForLevel(row.level + 1);
    return new EmbedBuilder().setColor(0x8065f6).setTitle(`Nivel de ${user.username}`).setThumbnail(user.displayAvatarURL()).setDescription(`**Nivel ${row.level}** · ${row.xp - current}/${next - current} XP\nXP total: **${row.xp}**`);
}

export async function execute(interaction: ChatInputCommandInteraction) { if (!interaction.guildId) return; await interaction.reply({ embeds: [await rank(interaction.guildId, interaction.options.getUser("usuario") ?? interaction.user)] }); }
export async function executePrefix(message: Message) { await message.reply({ embeds: [await rank(message.guild!.id, message.mentions.users.first() ?? message.author)] }); }
