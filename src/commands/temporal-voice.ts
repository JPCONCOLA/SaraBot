import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../lib/prisma.js";

const durationPattern = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;

function parseDuration(value: string): number | null {
    const match = durationPattern.exec(value.trim());
    if (!match || (!match[1] && !match[2] && !match[3])) return null;
    const milliseconds = (Number(match[1] ?? 0) * 3_600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)) * 1_000;
    return Number.isSafeInteger(milliseconds) && milliseconds > 0 ? milliseconds : null;
}

function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.ceil(milliseconds / 1_000);
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    const parts: string[] = [];
    if (hours) parts.push(`${hours} hora${hours === 1 ? "" : "s"}`);
    if (minutes) parts.push(`${minutes} minuto${minutes === 1 ? "" : "s"}`);
    if (seconds) parts.push(`${seconds} segundo${seconds === 1 ? "" : "s"}`);
    return parts.join(", ");
}

export const data = new SlashCommandBuilder()
    .setName("temporal-voice")
    .setDescription("Programa desconexiones de canales de voz")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(subcommand => subcommand.setName("programar").setDescription("Programa la desconexión de un usuario")
        .addUserOption(option => option.setName("usuario").setDescription("Usuario a desconectar").setRequired(true))
        .addStringOption(option => option.setName("tiempo").setDescription("Ej.: 30m, 2h, 90s o 1h30m").setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName("cancelar").setDescription("Cancela la desconexión programada de un usuario")
        .addUserOption(option => option.setName("usuario").setDescription("Usuario de la tarea").setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName("lista").setDescription("Muestra las desconexiones programadas"));

export const permission = PermissionFlagsBits.ModerateMembers;

export async function execute(interaction: ChatInputCommandInteraction) {
    // Discord exige confirmar la interacción en menos de tres segundos; las
    // consultas a miembros y MySQL pueden tardar más en Railway.
    await interaction.deferReply();
    const guild = interaction.guild;
    if (!guild) return void await interaction.editReply({ content: "❌ Este comando solo puede usarse en un servidor." });
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "lista") {
        const tasks = await prisma.voiceDisconnect.findMany({ where: { guildId: guild.id }, orderBy: { executeAt: "asc" } });
        if (!tasks.length) return void await interaction.editReply({ content: "ℹ️ No hay desconexiones programadas en este servidor." });
        const lines = tasks.map(task => `• <@${task.userId}> — <t:${Math.floor(task.executeAt.getTime() / 1_000)}:R> (tarea #${task.id})`);
        return void await interaction.editReply({ embeds: [{ color: 0x5865F2, title: "⏰ Desconexiones programadas", description: lines.join("\n") }] });
    }

    const user = interaction.options.getUser("usuario", true);
    if (subcommand === "cancelar") {
        const result = await prisma.voiceDisconnect.deleteMany({ where: { guildId: guild.id, userId: user.id } });
        return void await interaction.editReply(result.count
            ? { embeds: [{ color: 0x57F287, title: "✅ Desconexión cancelada", description: `Se canceló la desconexión programada de <@${user.id}>.` }] }
            : { content: "ℹ️ Ese usuario no tiene una desconexión programada en este servidor." });
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return void await interaction.editReply({ content: "❌ No encontré a ese usuario en el servidor." });
    if (!member.voice.channel) return void await interaction.editReply({ content: "❌ Ese usuario no está conectado a un canal de voz." });

    const botMember = await guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.MoveMembers)) {
        return void await interaction.editReply({ content: "❌ Necesito el permiso **Mover miembros** para programar esta desconexión." });
    }

    const duration = parseDuration(interaction.options.getString("tiempo", true));
    if (!duration) return void await interaction.editReply({ content: "❌ El tiempo no es válido. Usa `30m`, `2h`, `90s` o `1h30m`." });

    const executeAt = new Date(Date.now() + duration);
    const existing = await prisma.voiceDisconnect.findUnique({ where: { guildId_userId: { guildId: guild.id, userId: user.id } } });
    const task = existing
        ? await prisma.voiceDisconnect.update({ where: { id: existing.id }, data: { executeAt, lockedAt: null } })
        : await prisma.voiceDisconnect.create({ data: { guildId: guild.id, userId: user.id, executeAt } });
    const replaced = existing ? " Se reemplazó la programación anterior." : "";
    await interaction.editReply({ embeds: [{ color: 0x57F287, title: "✅ Desconexión programada", description: `<@${user.id}> será desconectado del canal de voz en ${formatDuration(duration)}.${replaced}\nTarea #${task.id} · <t:${Math.floor(executeAt.getTime() / 1_000)}:R>` }] });
}
