import { prisma } from "../lib/prisma.js";

export async function isCommandEnabled(guildId: string, commandName: string): Promise<boolean> {
    try {
        const setting = await prisma.guildCommandSetting.findUnique({
            where: { guildId_commandName: { guildId, commandName } },
            select: { enabled: true },
        });
        return setting?.enabled ?? true;
    } catch {
        // El bot sigue disponible mientras la base de datos se inicia o migra.
        return true;
    }
}
