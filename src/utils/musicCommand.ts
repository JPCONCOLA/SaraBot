import { ChatInputCommandInteraction, Message, type GuildMember } from "discord.js";
import { executeMusic, type MusicAction } from "./music.js";

export function musicCommand(
    name: string,
    description: string,
    action: MusicAction,
    optionName = "opcion",
    optionDescription = "Opcional",
) {
    return {
        data: {
            name,
            description,
            toJSON: () => ({
                name,
                description,
                options: optionName ? [{
                    type: 3,
                    name: optionName,
                    description: optionDescription,
                    required: false,
                }] : [],
            }),
        },
        async execute(interaction: ChatInputCommandInteraction) {
            await interaction.deferReply();
            try {
                const query = optionName ? interaction.options.getString(optionName) ?? undefined : undefined;
                const result = await executeMusic(interaction.guildId!, interaction.member as GuildMember, interaction.channel as unknown as { send(content: string): Promise<unknown>; id?: string }, action, query);
                await interaction.editReply(result);
            } catch (error) {
                await interaction.editReply(`❌ ${error instanceof Error ? error.message : "No se pudo ejecutar la acción."}`);
            }
        },
        async executePrefix(message: Message, args: string[]) {
            try {
                const result = await executeMusic(message.guild!.id, message.member!, message.channel as unknown as { send(content: string): Promise<unknown>; id?: string }, action, args.join(" ") || undefined);
                await message.reply(result);
            } catch (error) {
                await message.reply(`❌ ${error instanceof Error ? error.message : "No se pudo ejecutar la acción."}`);
            }
        },
    };
}
