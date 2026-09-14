import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type Message } from "discord.js";
import { getMusicSnapshot } from "./music.js";

function formatTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function progressBar(position: number, duration: number) {
    const length = 26;
    const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
    const marker = Math.round(progress * length);
    return `${"▬".repeat(marker)}🔘${"─".repeat(Math.max(0, length - marker))}`;
}

export function musicPanel(guildId: string, userId: string, channelId: string) {
    const snapshot = getMusicSnapshot(guildId);
    const current = snapshot?.current;
    const duration = current?.duration ?? 0;
    const position = duration > 0 ? Math.min(snapshot?.position ?? 0, duration) : 0;
    const status = current
        ? `• Added by **@${current.requestedBy}**\n• 🔊 💜 | <#${channelId}>\n\nQueue Size: **${snapshot?.tracks.length ?? 0}** · Volume: **${snapshot?.volume ?? 100}%** · Loop: **${snapshot?.loop ?? "off"}**\n${progressBar(position, duration)}\n\`${formatTime(position)}${duration ? ` / ${formatTime(duration)}` : ""}\``
        : "No hay una canción reproduciéndose.";
    const embed = new EmbedBuilder()
        .setColor(0x8f6cff)
        .setTitle("Reproduciendo ahora")
        .setDescription(current ? `**${current.title}**\n\n${status}` : status);
    if (current?.thumbnail) embed.setThumbnail(current.thumbnail);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`music:pause:${guildId}`).setLabel("Pause").setEmoji("⏸️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music:skip:${guildId}`).setLabel("Skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`music:stop:${guildId}`).setLabel("Stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`music:autoplay:${guildId}`).setLabel("AutoPlay").setEmoji("🔁").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setLabel("Dashboard").setEmoji("🗂️").setStyle(ButtonStyle.Link).setURL(process.env.DASHBOARD_URL ?? "http://localhost:3000"),
    );

    return { embeds: [embed], components: [row] };
}

export async function refreshMusicPanel(message: Message, guildId: string, userId: string, channelId: string) {
    await message.edit(musicPanel(guildId, userId, channelId));
}
