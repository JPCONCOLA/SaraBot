import { Client } from "discord.js";
import { prisma } from "../lib/prisma.js";

const POLL_INTERVAL_MS = 10_000;
const LOCK_TIMEOUT_MS = 60_000;

/** Ejecuta persistently scheduled voice disconnections every ten seconds. */
export class VoiceDisconnectScheduler {
    private timer: NodeJS.Timeout | null = null;
    private processing = false;

    constructor(private readonly client: Client) {}

    start() {
        if (this.timer) return;
        void this.processDueTasks();
        this.timer = setInterval(() => void this.processDueTasks(), POLL_INTERVAL_MS);
    }

    private async processDueTasks() {
        if (this.processing) return;
        this.processing = true;
        try {
            const tasks = await prisma.voiceDisconnect.findMany({
                where: { executeAt: { lte: new Date() } },
                orderBy: { executeAt: "asc" }
            });
            for (const task of tasks) {
                const lockedAt = new Date();
                const claim = await prisma.voiceDisconnect.updateMany({
                    where: {
                        id: task.id,
                        executeAt: task.executeAt,
                        OR: [{ lockedAt: null }, { lockedAt: { lte: new Date(Date.now() - LOCK_TIMEOUT_MS) } }]
                    },
                    data: { lockedAt }
                });
                if (claim.count) await this.processTask(task, lockedAt);
            }
        } catch (error) {
            console.error("No se pudieron revisar las desconexiones programadas:", error);
        } finally {
            this.processing = false;
        }
    }

    private async processTask(task: { id: number; guildId: string; userId: string; executeAt: Date }, lockedAt: Date) {
        try {
            const guild = await this.client.guilds.fetch(task.guildId).catch(() => null);
            if (!guild) return void await this.completeTask(task, lockedAt);

            const member = await guild.members.fetch(task.userId).catch(() => null);
            if (!member || !member.voice.channel) return void await this.completeTask(task, lockedAt);

            await member.voice.disconnect("Tiempo de canal de voz terminado");
            await member.send("⏰ Tu tiempo en el canal de voz terminó y has sido desconectado.").catch(() => null);
            await this.completeTask(task, lockedAt);
        } catch (error) {
            await prisma.voiceDisconnect.updateMany({ where: { id: task.id, lockedAt }, data: { lockedAt: null } });
            // Keep the record so transient Discord failures are retried.
            console.error(`No se pudo ejecutar la desconexión programada ${task.id}:`, error);
        }
    }

    private async completeTask(task: { id: number; executeAt: Date }, lockedAt: Date) {
        // Do not delete a task that was replaced while this cycle awaited Discord.
        await prisma.voiceDisconnect.deleteMany({ where: { id: task.id, executeAt: task.executeAt, lockedAt } });
    }
}
