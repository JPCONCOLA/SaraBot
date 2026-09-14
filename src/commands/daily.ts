import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { daily } from "./economy.js";
export const autoDefer = true;
export const data = new SlashCommandBuilder().setName("daily").setDescription("Reclama tu recompensa diaria");
export async function execute(interaction: ChatInputCommandInteraction) { if (interaction.guildId) await interaction.editReply(await daily(interaction.guildId, interaction.user.id)); }
