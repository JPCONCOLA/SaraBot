import { ChatInputCommandInteraction, Message, SlashCommandBuilder, type GuildMember } from "discord.js";
import { executeMusic } from "../utils/music.js";
import { musicPanel, refreshMusicPanel } from "../utils/musicPanel.js";

export const data = new SlashCommandBuilder()
    .setName("play")
    .setDescription("Reproduce una canción de YouTube o Spotify")
    .addStringOption(option => option.setName("busqueda").setDescription("Canción o enlace").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
        await executeMusic(interaction.guildId!, interaction.member as import("discord.js").GuildMember, interaction.channel as unknown as { send(content: string): Promise<unknown> }, "play", interaction.options.getString("busqueda", true));
        const member = interaction.member as GuildMember;
        await interaction.editReply(musicPanel(interaction.guildId!, interaction.user.id, member.voice.channelId ?? "0"));
        const panelMessage = await interaction.fetchReply();
        const timer = setInterval(() => void refreshMusicPanel(panelMessage as Message, interaction.guildId!, interaction.user.id, member.voice.channelId ?? "0").catch(() => clearInterval(timer)), 10_000);
        setTimeout(() => clearInterval(timer), 30 * 60_000);
    } catch (error) {
        await interaction.editReply(`❌ ${error instanceof Error ? error.message : "No se pudo reproducir la canción."}`);
    }
}

export async function executePrefix(message: Message, args: string[]) {
    try {
        await executeMusic(message.guild!.id, message.member!, message.channel as unknown as { send(content: string): Promise<unknown> }, "play", args.join(" "));
    } catch (error) {
        await message.reply(`❌ ${error instanceof Error ? error.message : "No se pudo reproducir la canción."}`);
    }
}
