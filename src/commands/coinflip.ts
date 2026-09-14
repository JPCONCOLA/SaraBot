import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { coinflip } from "./economy.js";
export const autoDefer = true;
export const data = new SlashCommandBuilder().setName("coinflip").setDescription("Apuesta cara o sello").addIntegerOption(option => option.setName("cantidad").setDescription("Apuesta").setRequired(true).setMinValue(1)).addStringOption(option => option.setName("eleccion").setDescription("Elección").setRequired(true).addChoices({ name: "Cara", value: "cara" }, { name: "Sello", value: "sello" }));
export async function execute(interaction: ChatInputCommandInteraction) { if (interaction.guildId) await interaction.editReply(await coinflip(interaction.guildId, interaction.user.id, interaction.options.getInteger("cantidad", true), interaction.options.getString("eleccion", true))); }
