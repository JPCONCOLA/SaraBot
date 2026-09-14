import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { pay } from "./economy.js";
export const autoDefer = true;
export const data = new SlashCommandBuilder().setName("pay").setDescription("Envía dinero a otro usuario").addUserOption(option => option.setName("usuario").setDescription("Destinatario").setRequired(true)).addIntegerOption(option => option.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1));
export async function execute(interaction: ChatInputCommandInteraction) { if (interaction.guildId) await interaction.editReply(await pay(interaction.guildId, interaction.user.id, interaction.options.getUser("usuario", true), interaction.options.getInteger("cantidad", true))); }
