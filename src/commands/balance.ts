import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { balance } from "./economy.js";
export const autoDefer = true;
export const data = new SlashCommandBuilder().setName("balance").setDescription("Consulta tu saldo").addUserOption(option => option.setName("usuario").setDescription("Usuario a consultar"));
export async function execute(interaction: ChatInputCommandInteraction) { if (interaction.guildId) await interaction.editReply({ embeds: [await balance(interaction.guildId, interaction.options.getUser("usuario") ?? interaction.user)] }); }
