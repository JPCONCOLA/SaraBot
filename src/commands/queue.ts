import { ChatInputCommandInteraction, Message, SlashCommandBuilder } from "discord.js";
import { executeMusic } from "../utils/music.js";

export const data = new SlashCommandBuilder().setName("queue").setDescription("Muestra la cola de música");

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try { const result = await executeMusic(interaction.guildId!, interaction.member as import("discord.js").GuildMember, interaction.channel as unknown as { send(content: string): Promise<unknown> }, "queue"); await interaction.editReply(result); }
    catch (error) { await interaction.editReply(`❌ ${error instanceof Error ? error.message : "No se pudo consultar la cola."}`); }
}

export async function executePrefix(message: Message) {
    try { await executeMusic(message.guild!.id, message.member!, message.channel as unknown as { send(content: string): Promise<unknown> }, "queue"); }
    catch (error) { await message.reply(`❌ ${error instanceof Error ? error.message : "No se pudo consultar la cola."}`); }
}
