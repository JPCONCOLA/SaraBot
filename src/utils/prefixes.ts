import { prisma } from "../lib/prisma.js";

const DEFAULT_PREFIX = process.env.DEFAULT_PREFIX ?? "!";

export async function getPrefix(guildId: string): Promise<string> {
    const settings = await prisma.guildSettings.findUnique({
        where: { guildId },
        select: { prefix: true },
    });

    return settings?.prefix ?? DEFAULT_PREFIX;
}

export async function setPrefix(guildId: string, prefix: string): Promise<void> {
    await prisma.guildSettings.upsert({
        where: { guildId },
        create: { guildId, prefix },
        update: { prefix },
    });
}
