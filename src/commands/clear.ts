import { SlashCommandBuilder, PermissionFlagsBits, ChatInputCommandInteraction, Message, TextChannel, GuildMember } from "discord.js";
import { executeMusic } from "../utils/music.js";

export const data = new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Borra mensajes o vacía la cola de música")
    .addIntegerOption(option =>
        option.setName("cantidad")
            .setDescription("Cantidad de mensajes a borrar (1-100)")
            .setMinValue(1)
            .setMaxValue(100))
    .addUserOption(option =>
        option.setName("usuario").setDescription("Solo borrar mensajes de este usuario").setRequired(false))
    .addBooleanOption(option =>
        option.setName("musica").setDescription("Vacía la cola de música en lugar de borrar mensajes").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export const permission = PermissionFlagsBits.ManageMessages;

export async function execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getBoolean("musica")) {
        await interaction.deferReply();
        try {
            const result = await executeMusic(interaction.guildId!, interaction.member as GuildMember, interaction.channel as unknown as { send(content: string): Promise<unknown>; id?: string }, "clear");
            await interaction.editReply(result);
        } catch (error) {
            await interaction.editReply(`❌ ${error instanceof Error ? error.message : "No se pudo vaciar la cola."}`);
        }
        return;
    }
    const cantidad = interaction.options.getInteger("cantidad");
    if (!cantidad) {
        await interaction.reply({ content: "❌ Indica una cantidad o activa la opción `musica`.", ephemeral: true });
        return;
    }
    const usuario = interaction.options.getUser("usuario");
    const canal = interaction.channel as TextChannel;

    await interaction.deferReply({ ephemeral: true });

    const mensajes = await canal.messages.fetch({ limit: 100 });
    const filtrados = usuario
        ? mensajes.filter(m => m.author.id === usuario.id).first(cantidad)
        : mensajes.first(cantidad);

    const borrados = await canal.bulkDelete(filtrados, true);
    await interaction.editReply(`🧹 Se borraron **${borrados.size}** mensajes.`);
}

export async function executePrefix(message: Message, args: string[]) {
    if (args[0]?.toLowerCase() === "music" || args[0]?.toLowerCase() === "musica") {
        try {
            const result = await executeMusic(message.guild!.id, message.member!, message.channel as unknown as { send(content: string): Promise<unknown>; id?: string }, "clear");
            await message.reply(result);
        } catch (error) {
            await message.reply(`❌ ${error instanceof Error ? error.message : "No se pudo vaciar la cola."}`);
        }
        return;
    }
    const cantidad = parseInt(args[0] ?? "");
    if (isNaN(cantidad) || cantidad < 1 || cantidad > 100) {
        await message.reply("❌ Indica una cantidad entre 1 y 100. Ejemplo: clear 10");
        return;
    }
    const usuario = message.mentions.users.first();
    const canal = message.channel as TextChannel;

    const mensajes = await canal.messages.fetch({ limit: 100 });
    const filtrados = usuario
        ? mensajes.filter(m => m.author.id === usuario.id).first(cantidad)
        : mensajes.first(cantidad);

    const borrados = await canal.bulkDelete(filtrados, true);
    const aviso = await canal.send(`🧹 Se borraron **${borrados.size}** mensajes.`);
    setTimeout(() => aviso.delete().catch(() => null), 5000);
}
