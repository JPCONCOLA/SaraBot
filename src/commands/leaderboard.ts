import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { leaderboard } from "./economy.js";
export const autoDefer = true;
export const data = new SlashCommandBuilder().setName("leaderboard").setDescription("Muestra el ranking económico");
export async function execute(interaction: ChatInputCommandInteraction) { if (interaction.guildId) await interaction.editReply({ embeds: [await leaderboard(interaction.guildId)] }); }
