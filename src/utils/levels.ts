import { prisma } from "../lib/prisma.js";

export function xpForLevel(level: number) { return 100 * level * level + 100 * level; }

export async function addXp(guildId: string, userId: string, amount: number) {
    const current = await prisma.userLevel.upsert({ where: { guildId_userId: { guildId, userId } }, create: { guildId, userId, xp: amount }, update: { xp: { increment: amount } } });
    let level = current.level;
    while (current.xp >= xpForLevel(level + 1)) level++;
    if (level !== current.level) return { level: await prisma.userLevel.update({ where: { id: current.id }, data: { level } }), leveledUp: true };
    return { level: current, leveledUp: false };
}

export async function getLevel(guildId: string, userId: string) {
    return prisma.userLevel.upsert({ where: { guildId_userId: { guildId, userId } }, create: { guildId, userId }, update: {} });
}
