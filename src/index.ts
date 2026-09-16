import { Client, GatewayIntentBits, Collection, ChatInputCommandInteraction, Message, Partials } from "discord.js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getPrefix } from "./utils/prefixes.js";
import { isCommandEnabled } from "./utils/commandSettings.js";
import { addXp } from "./utils/levels.js";
import { prisma } from "./lib/prisma.js";
import { checkAutoMod } from "./utils/automod.js";
import { executeMusic } from "./utils/music.js";
import { musicPanel } from "./utils/musicPanel.js";
import { VoiceDisconnectScheduler } from "./utils/voiceDisconnectScheduler.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const xpCooldowns = new Map<string, number>();

// --- Tipo común para un comando (slash + prefijo) ---
type Command = {
    data: { name: string; description: string };
    permission?: bigint;
    autoDefer?: boolean;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    executePrefix?: (message: Message, args: string[]) => Promise<void>;
};

const commands = new Collection<string, Command>();
(client as unknown as { commands: Collection<string, Command> }).commands = commands;

async function main() {
    // --- Carga dinámica de comandos ---
    const commandsPath = path.join(__dirname, "commands");
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts"));

    for (const file of commandFiles) {
        const command: Command = await import(pathToFileURL(path.join(commandsPath, file)).href);
        commands.set(command.data.name, command);
    }

    // --- Eventos ---
    client.once("clientReady", () => {
        console.log(`✅ SaraBot está conectado como ${client.user?.tag}`);
        console.log("DATABASE_URL configurada:", process.env.DATABASE_URL ? "Sí" : "No");
        new VoiceDisconnectScheduler(client).start();
        console.log("Programador de desconexiones de voz iniciado.");
    });

    client.on("interactionCreate", async interaction => {
        if (interaction.isButton() && interaction.customId.startsWith("music:")) {
            const [, action, guildId] = interaction.customId.split(":");
            if (!guildId || interaction.guildId !== guildId) return;
            try {
                await interaction.deferUpdate();
                const member = interaction.member as import("discord.js").GuildMember;
                const result = await executeMusic(guildId, member, interaction.channel as unknown as { send(content: string): Promise<unknown>; id?: string }, action as import("./utils/music.js").MusicAction);
                await interaction.message.edit(musicPanel(guildId, interaction.user.id, member.voice.channelId ?? "0"));
                if (result) await interaction.followUp({ content: result, ephemeral: true });
            } catch (error) {
                try {
                    await interaction.followUp({ content: `❌ ${error instanceof Error ? error.message : "No se pudo ejecutar el control."}`, ephemeral: true });
                } catch (responseError) {
                    console.error("No se pudo responder al botón de música:", responseError);
                }
            }
            return;
        }
        if (!interaction.isChatInputCommand()) return;

        const command = commands.get(interaction.commandName);
        if (!command) return;

        if (interaction.guildId && !await isCommandEnabled(interaction.guildId, interaction.commandName)) {
            await interaction.reply({ content: "Este comando está desactivado en este servidor.", ephemeral: true });
            return;
        }

        try {
            if (command.autoDefer) await interaction.deferReply();
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            const respuesta = { content: "❌ Ocurrió un error al ejecutar este comando.", ephemeral: true };
            try {
                if (interaction.replied || interaction.deferred) await interaction.followUp(respuesta);
                else if (interaction.isRepliable()) await interaction.reply(respuesta);
            } catch (responseError) {
                console.error("No se pudo enviar el error de la interacción:", responseError);
            }
        }
    });

    client.on("messageCreate", async message => {
        if (message.author.bot || !message.guild) return;

        try { if (await checkAutoMod(message)) return; } catch (error) { console.error("AutoMod error:", error); }

        const xpKey = `${message.guild.id}:${message.author.id}`;
        if ((xpCooldowns.get(xpKey) ?? 0) < Date.now()) {
            xpCooldowns.set(xpKey, Date.now() + 60_000);
            try {
                const result = await addXp(message.guild.id, message.author.id, 15 + Math.floor(Math.random() * 11));
                if (result.leveledUp) await message.channel.send(`🎉 ${message.author}, subiste a nivel **${result.level.level}**.`);
            } catch (error) { console.error("No se pudo sumar XP:", error); }
        }

        const prefix = await getPrefix(message.guild.id);
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const commandName = args.shift()?.toLowerCase();
        if (!commandName) return;

        const command = commands.get(commandName);
        if (!command?.executePrefix) return;

        if (!await isCommandEnabled(message.guild.id, commandName)) {
            await message.reply("Este comando está desactivado en este servidor.");
            return;
        }

        if (command.permission && !message.member?.permissions.has(command.permission)) {
            await message.reply("❌ No tienes permiso para usar este comando.");
            return;
        }

        try {
            await command.executePrefix(message, args);
        } catch (error) {
            console.error(error);
            await message.reply("❌ Ocurrió un error al ejecutar este comando.");
        }
    });

    client.on("messageReactionAdd", async (reaction, user) => {
        if (user.bot) return;
        try {
            if (reaction.partial) await reaction.fetch();
            const guild = reaction.message.guild;
            if (!guild) return;
            const emoji = reaction.emoji.identifier ?? reaction.emoji.name;
            if (!emoji) return;
            const rules = await prisma.reactionRole.findMany({ where: { guildId: guild.id, messageId: reaction.message.id, emoji } });
            if (!rules.length) return;
            const member = await guild.members.fetch(user.id);
            for (const rule of rules) { const role = await guild.roles.fetch(rule.roleId); if (role) await member.roles.add(role); }
        } catch (error) { console.error("No se pudo asignar reaction role:", error); }
    });
    client.on("messageReactionRemove", async (reaction, user) => {
        if (user.bot) return;
        try {
            if (reaction.partial) await reaction.fetch();
            const guild = reaction.message.guild;
            if (!guild) return;
            const emoji = reaction.emoji.identifier ?? reaction.emoji.name;
            if (!emoji) return;
            const rules = await prisma.reactionRole.findMany({ where: { guildId: guild.id, messageId: reaction.message.id, emoji } });
            const member = await guild.members.fetch(user.id);
            for (const rule of rules) { const role = await guild.roles.fetch(rule.roleId); if (role) await member.roles.remove(role); }
        } catch (error) { console.error("No se pudo retirar reaction role:", error); }
    });

    client.login(process.env.DISCORD_TOKEN);
}

main();
