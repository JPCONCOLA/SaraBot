import { Message, PermissionFlagsBits } from "discord.js";
import { prisma } from "../lib/prisma.js";

const recentMessages = new Map<string, { content: string; times: number[] }>();

function hasZalgo(text: string) { return (text.match(/[\u0300-\u036f]/g) ?? []).length > 8; }
function emojiCount(text: string) { return (text.match(/<a?:\w+:\d+>|[\p{Extended_Pictographic}]/gu) ?? []).length; }

export async function checkAutoMod(message: Message): Promise<boolean> {
    if (!message.guild || !message.member || message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;
    const [settings, moderation] = await Promise.all([prisma.autoModSettings.findUnique({ where: { guildId: message.guild.id } }), prisma.guildModerationSettings.findUnique({ where: { guildId: message.guild.id } })]);
    if (!settings?.enabled) return false;
    const ignoredChannels = (moderation?.ignoredChannelIds ?? "").split(/[,\n]/).map(value => value.trim());
    const immuneRoles = (moderation?.immuneRoleIds ?? "").split(/[,\n]/).map(value => value.trim());
    if (ignoredChannels.includes(message.channel.id) || message.member.roles.cache.some(role => immuneRoles.includes(role.id))) return false;
    const text = message.content; const lowered = text.toLowerCase(); let rule: string | null = null;
    const blocked = (settings.blockedWords ?? "").split(/[,\n]/).map(word => word.trim().toLowerCase()).filter(Boolean);
    if (settings.badWords && blocked.some(word => lowered.includes(word))) rule = "Palabras inapropiadas";
    if (!rule && settings.invites && /(?:discord\.gg|discord(?:app)?\.com\/invite)\//i.test(text)) rule = "Invitaciones a servidores";
    if (!rule && settings.externalLinks && /https?:\/\//i.test(text)) rule = "Enlaces externos";
    const letters = text.match(/[a-záéíóúñ]/gi) ?? [];
    if (!rule && settings.excessiveCaps && letters.length >= 12 && letters.filter(char => char === char.toUpperCase()).length / letters.length >= .7) rule = "Demasiadas mayusculas";
    if (!rule && settings.excessiveEmojis && emojiCount(text) > 8) rule = "Demasiados emojis";
    if (!rule && settings.excessiveSpoilers && (text.match(/\|\|/g) ?? []).length >= 6) rule = "Demasiados spoilers";
    if (!rule && settings.excessiveMentions && message.mentions.users.size + message.mentions.roles.size > 5) rule = "Demasiadas menciones";
    if (!rule && settings.zalgo && hasZalgo(text)) rule = "Texto zalgo";
    const key = `${message.guild.id}:${message.author.id}`; const now = Date.now(); const previous = recentMessages.get(key) ?? { content: "", times: [] }; const times = previous.times.filter(time => time > now - 7000); times.push(now); recentMessages.set(key, { content: text, times });
    if (!rule && settings.repeatedText && previous.content === text && text.length > 4) rule = "Texto repetido";
    if (!rule && settings.antiSpam && times.length >= 6) rule = "Anti-spam";
    if (!rule) return false;
    await message.delete().catch(() => null);
    await prisma.moderationLog.create({ data: { guildId: message.guild.id, userId: message.author.id, rule, content: text.slice(0, 500) } });
    if (moderation?.auditAutoMod && moderation.auditChannelId) {
        const channel = await message.guild.channels.fetch(moderation.auditChannelId).catch(() => null);
        if (channel?.isSendable()) await channel.send(`🛡️ AutoMod · **${rule}** · ${message.author} · ${text.slice(0, 300)}`).catch(() => null);
    }
    if (!message.channel.isSendable()) return true;
    const warning = await message.channel.send(`⚠️ ${message.author}, tu mensaje fue eliminado: **${rule}**.`).catch(() => null);
    if (warning) setTimeout(() => warning.delete().catch(() => null), 5000);
    return true;
}
