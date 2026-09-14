import { REST, Routes } from "discord.js";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
    // --- Carga dinámica de comandos ---
    const commandsPath = path.join(__dirname, "commands");
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".ts"));

    const commands = [];
    for (const file of commandFiles) {
        const command = await import(pathToFileURL(path.join(commandsPath, file)).href);
        commands.push(command.data.toJSON());
    }

    // --- Registro en la API de Discord ---
    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

    try {
        console.log(`⏳ Registrando ${commands.length} comandos...`);

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID!, process.env.GUILD_ID!),
            { body: commands }
        );

        console.log("✅ Comandos registrados correctamente.");
    } catch (error) {
        console.error(error);
    }
}

main();