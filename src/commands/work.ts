import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { work } from "./economy.js";
export const autoDefer = true;
export const data = new SlashCommandBuilder().setName("work").setDescription("Trabaja para ganar dinero");
export async function execute(interaction: ChatInputCommandInteraction) { if (interaction.guildId) await interaction.editReply(await work(interaction.guildId, interaction.user.id)); }
