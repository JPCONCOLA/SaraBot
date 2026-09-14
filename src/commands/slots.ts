import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { slots } from "./economy.js";
export const autoDefer = true;
export const data = new SlashCommandBuilder().setName("slots").setDescription("Juega tragamonedas").addIntegerOption(option => option.setName("cantidad").setDescription("Apuesta").setRequired(true).setMinValue(1));
export async function execute(interaction: ChatInputCommandInteraction) { if (interaction.guildId) await interaction.editReply(await slots(interaction.guildId, interaction.user.id, interaction.options.getInteger("cantidad", true))); }
