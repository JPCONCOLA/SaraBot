import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { moveMoney } from "./economy.js";
export const autoDefer = true;
export const data = new SlashCommandBuilder().setName("withdraw").setDescription("Retira dinero del banco").addIntegerOption(option => option.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1));
export async function execute(interaction: ChatInputCommandInteraction) { if (interaction.guildId) await interaction.editReply(await moveMoney(interaction.guildId, interaction.user.id, interaction.options.getInteger("cantidad", true), false)); }
