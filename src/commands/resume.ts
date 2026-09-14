import { ChatInputCommandInteraction, Message, SlashCommandBuilder } from "discord.js";
import { executeMusic } from "../utils/music.js";

export const data = new SlashCommandBuilder().setName("resume").setDescription("Reanuda la música");

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try { await executeMusic(interaction.guildId!, interaction.member as import("discord.js").GuildMember, interaction.channel as unknown as { send(content: string): Promise<unknown> }, "resume"); await interaction.editReply("✅ Música reanudada."); }
    catch (error) { await interaction.editReply(`❌ ${error instanceof Error ? error.message : "No se pudo reanudar la música."}`); }
}

export async function executePrefix(message: Message) {
    try { await executeMusic(message.guild!.id, message.member!, message.channel as unknown as { send(content: string): Promise<unknown> }, "resume"); }
    catch (error) { await message.reply(`❌ ${error instanceof Error ? error.message : "No se pudo reanudar la música."}`); }
}
