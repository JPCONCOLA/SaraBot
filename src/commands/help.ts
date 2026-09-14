import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Message, Client } from "discord.js";
import { getPrefix } from "../utils/prefixes.js";

export const data = new SlashCommandBuilder()
    .setName("help")
    .setDescription("Muestra todos los comandos disponibles");

// --- Construcción del embed ---
function buildEmbed(prefix: string, client: Client) {
    const commands = (client as unknown as { commands: Map<string, { data: { name: string; description: string } }> }).commands;

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📖 Comandos de SaraBot")
        .setDescription(`Configura SaraBot y consulta todos los comandos en el [panel web](${process.env.DASHBOARD_URL ?? "http://localhost:3000"}).\n\nUsa cualquier comando con **/** o con el prefijo **\`${prefix}\`**`)
        .setTimestamp()
        .setFooter({ text: "SaraBot • Administración de servidor" });

    if (client.user) {
        embed.setThumbnail(client.user.displayAvatarURL());
    }

    for (const command of commands.values()) {
        if (command.data.name === "help") continue;
        embed.addFields({
            name: `🔹 /${command.data.name}`,
            value: `${command.data.description}\nPrefijo: \`${prefix}${command.data.name}\``,
        });
    }

    return embed;
}

export async function execute(interaction: ChatInputCommandInteraction) {
    const prefix = await getPrefix(interaction.guildId!);
    const embed = buildEmbed(prefix, interaction.client);
    await interaction.reply({ embeds: [embed] });
}

export async function executePrefix(message: Message) {
    const prefix = await getPrefix(message.guild!.id);
    const embed = buildEmbed(prefix, message.client);
    await message.reply({ embeds: [embed] });
}
