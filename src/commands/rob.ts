import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { rob } from "./economy.js";
export const autoDefer = true;
export const data = new SlashCommandBuilder().setName("rob").setDescription("Intenta robar a otro usuario").addUserOption(option => option.setName("usuario").setDescription("Objetivo").setRequired(true));
export async function execute(interaction: ChatInputCommandInteraction) { if (interaction.guildId) await interaction.editReply(await rob(interaction.guildId, interaction.user.id, interaction.options.getUser("usuario", true))); }
