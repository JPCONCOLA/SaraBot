import { prisma } from "../lib/prisma.js";

export const STARTING_CASH = 500;
export const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
export const WORK_COOLDOWN = 60 * 60 * 1000;

export function formatMoney(amount: number): string {
    return new Intl.NumberFormat("es-CO").format(amount);
}

export function parseAmount(input: string | undefined, available: number): number | null {
    if (!input) return null;
    if (input.toLowerCase() === "all" || input.toLowerCase() === "todo") return available;
    if (!/^\d+$/.test(input)) return null;

    const amount = Number(input);
    return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function remainingCooldown(lastAction: Date | null, cooldown: number): number {
    if (!lastAction) return 0;
    return Math.max(0, lastAction.getTime() + cooldown - Date.now());
}

export function formatRemaining(milliseconds: number): string {
    const totalMinutes = Math.ceil(milliseconds / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}min` : `${minutes} min`;
}

export async function getEconomy(userId: string, guildId: string) {
    return prisma.userEconomy.upsert({
        where: { userId_guildId: { userId, guildId } },
        create: { userId, guildId, cash: STARTING_CASH },
        update: {},
    });
}
