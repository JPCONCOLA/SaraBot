import { ChatInputCommandInteraction, Message, SlashCommandBuilder } from "discord.js";
import { executeMusic } from "../utils/music.js";

export const data = new SlashCommandBuilder().setName("stop").setDescription("Detiene la música y vacía la cola");

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try { await executeMusic(interaction.guildId!, interaction.member as import("discord.js").GuildMember, interaction.channel as unknown as { send(content: string): Promise<unknown> }, "stop"); await interaction.editReply("✅ Música detenida."); }
    catch (error) { await interaction.editReply(`❌ ${error instanceof Error ? error.message : "No se pudo detener la música."}`); }
}

export async function executePrefix(message: Message) {
    try { await executeMusic(message.guild!.id, message.member!, message.channel as unknown as { send(content: string): Promise<unknown> }, "stop"); }
    catch (error) { await message.reply(`❌ ${error instanceof Error ? error.message : "No se pudo detener la música."}`); }
}
