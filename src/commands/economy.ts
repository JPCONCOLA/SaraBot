import { ChatInputCommandInteraction, EmbedBuilder, Message, SlashCommandBuilder, User } from "discord.js";
import { prisma } from "../lib/prisma.js";
import { DAILY_COOLDOWN, formatMoney, formatRemaining, getEconomy, parseAmount, remainingCooldown, WORK_COOLDOWN } from "../utils/economy.js";
import { resolveUserFromArgs } from "../utils/resolveUser.js";

const DAILY_MIN = 250;
const DAILY_MAX = 450;
const WORK_MIN = 80;
const WORK_MAX = 180;
const MAX_BET = 100_000;
const ROB_COOLDOWN = 2 * 60 * 60 * 1000;
export const autoDefer = true;

export const data = new SlashCommandBuilder()
    .setName("economy")
    .setDescription("Sistema de economía")
    .addSubcommand(command => command.setName("balance").setDescription("Consulta tu saldo o el de otro usuario").addUserOption(option => option.setName("usuario").setDescription("Usuario a consultar")))
    .addSubcommand(command => command.setName("deposit").setDescription("Deposita dinero en el banco").addIntegerOption(option => option.setName("cantidad").setDescription("Cantidad").setMinValue(1).setRequired(true)))
    .addSubcommand(command => command.setName("withdraw").setDescription("Retira dinero del banco").addIntegerOption(option => option.setName("cantidad").setDescription("Cantidad").setMinValue(1).setRequired(true)))
    .addSubcommand(command => command.setName("daily").setDescription("Reclama tu recompensa diaria"))
    .addSubcommand(command => command.setName("work").setDescription("Trabaja para ganar dinero"))
    .addSubcommand(command => command.setName("pay").setDescription("Envía dinero a otro usuario").addUserOption(option => option.setName("usuario").setDescription("Destinatario").setRequired(true)).addIntegerOption(option => option.setName("cantidad").setDescription("Cantidad").setMinValue(1).setRequired(true)))
    .addSubcommand(command => command.setName("coinflip").setDescription("Apuesta en cara o sello").addIntegerOption(option => option.setName("cantidad").setDescription("Apuesta").setMinValue(1).setRequired(true)).addStringOption(option => option.setName("eleccion").setDescription("Tu elección").setRequired(true).addChoices({ name: "Cara", value: "cara" }, { name: "Sello", value: "sello" })))
    .addSubcommand(command => command.setName("slots").setDescription("Juega a las tragamonedas").addIntegerOption(option => option.setName("cantidad").setDescription("Apuesta").setMinValue(1).setRequired(true)))
    .addSubcommand(command => command.setName("leaderboard").setDescription("Muestra los usuarios más ricos"));

function random(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function transaction(economyId: number, type: string, amount: number, cash: number, bank: number, metadata?: string) {
    return prisma.economyTransaction.create({
        data: { economyId, type, amount, balanceCash: cash, balanceBank: bank, metadata: metadata ?? null },
    });
}

export async function balance(guildId: string, user: User): Promise<EmbedBuilder> {
    const economy = await getEconomy(user.id, guildId);
    return new EmbedBuilder().setColor(0x57f287).setTitle(`Economía de ${user.username}`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
            { name: "Billetera", value: `$${formatMoney(economy.cash)}`, inline: true },
            { name: "Banco", value: `$${formatMoney(economy.bank)}`, inline: true },
            { name: "Patrimonio", value: `$${formatMoney(economy.cash + economy.bank)}`, inline: true },
        );
}

export async function moveMoney(guildId: string, userId: string, amount: number, toBank: boolean): Promise<string> {
    const economy = await getEconomy(userId, guildId);
    const available = toBank ? economy.cash : economy.bank;
    if (amount > available) return `No tienes suficiente dinero en ${toBank ? "tu billetera" : "el banco"}.`;

    const updated = await prisma.userEconomy.update({
        where: { id: economy.id },
        data: toBank ? { cash: { decrement: amount }, bank: { increment: amount } } : { cash: { increment: amount }, bank: { decrement: amount } },
    });
    await transaction(updated.id, toBank ? "DEPOSIT" : "WITHDRAW", amount, updated.cash, updated.bank);
    return `${toBank ? "Depositaste" : "Retiraste"} $${formatMoney(amount)} ${toBank ? "en el banco" : "de tu banco"}.`;
}

export async function daily(guildId: string, userId: string): Promise<string> {
    const economy = await getEconomy(userId, guildId);
    const remaining = remainingCooldown(economy.lastDailyAt, DAILY_COOLDOWN);
    if (remaining) return `Ya reclamaste tu recompensa diaria. Vuelve en ${formatRemaining(remaining)}.`;
    const reward = random(DAILY_MIN, DAILY_MAX);
    const updated = await prisma.userEconomy.update({ where: { id: economy.id }, data: { cash: { increment: reward }, lastDailyAt: new Date() } });
    await transaction(updated.id, "DAILY", reward, updated.cash, updated.bank);
    return `Reclamaste $${formatMoney(reward)} como recompensa diaria.`;
}

export async function work(guildId: string, userId: string): Promise<string> {
    const economy = await getEconomy(userId, guildId);
    const remaining = remainingCooldown(economy.lastWorkAt, WORK_COOLDOWN);
    if (remaining) return `Estás descansando. Podrás trabajar de nuevo en ${formatRemaining(remaining)}.`;
    const reward = random(WORK_MIN, WORK_MAX);
    const jobs = ["programaste un bot", "moderaste el servidor", "ayudaste a un vecino", "vendiste galletas"];
    const updated = await prisma.userEconomy.update({ where: { id: economy.id }, data: { cash: { increment: reward }, lastWorkAt: new Date() } });
    await transaction(updated.id, "WORK", reward, updated.cash, updated.bank);
    return `${jobs[random(0, jobs.length - 1)]} y ganaste $${formatMoney(reward)}.`;
}

export async function pay(guildId: string, fromId: string, recipient: User, amount: number): Promise<string> {
    if (fromId === recipient.id || recipient.bot) return "Elige a otro usuario que no sea un bot.";
    const sender = await getEconomy(fromId, guildId);
    if (amount > sender.cash) return "No tienes suficiente dinero en tu billetera.";
    const recipientEconomy = await getEconomy(recipient.id, guildId);
    const [from, to] = await prisma.$transaction([
        prisma.userEconomy.update({ where: { id: sender.id }, data: { cash: { decrement: amount } } }),
        prisma.userEconomy.update({ where: { id: recipientEconomy.id }, data: { cash: { increment: amount } } }),
    ]);
    await Promise.all([
        transaction(from.id, "PAYMENT_SENT", -amount, from.cash, from.bank, recipient.id),
        transaction(to.id, "PAYMENT_RECEIVED", amount, to.cash, to.bank, fromId),
    ]);
    return `Enviaste $${formatMoney(amount)} a ${recipient}.`;
}

export async function coinflip(guildId: string, userId: string, bet: number, choice: string): Promise<string> {
    const economy = await getEconomy(userId, guildId);
    if (bet > MAX_BET || bet > economy.cash) return `La apuesta debe estar entre $1 y $${formatMoney(Math.min(MAX_BET, economy.cash))}.`;
    const result = Math.random() < 0.5 ? "cara" : "sello";
    const won = choice === result;
    const updated = await prisma.userEconomy.update({ where: { id: economy.id }, data: { cash: { increment: won ? bet : -bet } } });
    await transaction(updated.id, "COINFLIP", won ? bet : -bet, updated.cash, updated.bank, result);
    return `Salió **${result}**. ${won ? `Ganaste $${formatMoney(bet)}.` : `Perdiste $${formatMoney(bet)}.`}`;
}

export async function slots(guildId: string, userId: string, bet: number): Promise<string> {
    const economy = await getEconomy(userId, guildId);
    if (bet > MAX_BET || bet > economy.cash) return `La apuesta debe estar entre $1 y $${formatMoney(Math.min(MAX_BET, economy.cash))}.`;
    const symbols = ["🍒", "🍋", "🍇", "💎", "7️⃣"];
    const reel = [symbols[random(0, 4)], symbols[random(0, 4)], symbols[random(0, 4)]] as string[];
    const same = reel[0] === reel[1] && reel[1] === reel[2];
    const pair = reel[0] === reel[1] || reel[1] === reel[2] || reel[0] === reel[2];
    const multiplier = same ? (reel[0] === "7️⃣" ? 10 : 5) : pair ? 2 : 0;
    const change = multiplier ? bet * multiplier : -bet;
    const updated = await prisma.userEconomy.update({ where: { id: economy.id }, data: { cash: { increment: change } } });
    await transaction(updated.id, "SLOTS", change, updated.cash, updated.bank, reel.join(""));
    return `**${reel.join(" | ")}**\n${multiplier ? `Ganaste $${formatMoney(change)} (x${multiplier}).` : `Perdiste $${formatMoney(bet)}.`}`;
}

export async function rob(guildId: string, userId: string, target: User): Promise<string> {
    if (target.id === userId || target.bot) return "Elige a otro usuario que no sea un bot.";
    const thief = await getEconomy(userId, guildId);
    const remaining = remainingCooldown(thief.lastRobAt, ROB_COOLDOWN);
    if (remaining) return `Debes esperar ${formatRemaining(remaining)} antes de volver a robar.`;
    const victim = await getEconomy(target.id, guildId);
    if (victim.cash < 50) return `${target.username} no lleva suficiente dinero en la billetera.`;

    const success = Math.random() < 0.45;
    const amount = success ? Math.min(victim.cash, random(50, Math.min(350, Math.max(50, Math.floor(victim.cash * 0.2))))) : Math.min(thief.cash, random(50, 150));
    const [updatedThief, updatedVictim] = await prisma.$transaction([
        prisma.userEconomy.update({ where: { id: thief.id }, data: { cash: { increment: success ? amount : -amount }, lastRobAt: new Date() } }),
        prisma.userEconomy.update({ where: { id: victim.id }, data: { cash: { increment: success ? -amount : amount } } }),
    ]);
    await Promise.all([
        transaction(updatedThief.id, success ? "ROB_SUCCESS" : "ROB_FAIL", success ? amount : -amount, updatedThief.cash, updatedThief.bank, target.id),
        transaction(updatedVictim.id, success ? "ROBBED" : "ROB_REWARD", success ? -amount : amount, updatedVictim.cash, updatedVictim.bank, userId),
    ]);
    return success ? `Robaste $${formatMoney(amount)} a ${target}.` : `Te atraparon intentando robar a ${target} y le pagaste $${formatMoney(amount)}.`;
}

export async function leaderboard(guildId: string): Promise<EmbedBuilder> {
    const rows = await prisma.userEconomy.findMany({ where: { guildId }, orderBy: [{ cash: "desc" }], take: 10 });
    const description = rows.length ? rows.map((row, index) => `**${index + 1}.** <@${row.userId}> — $${formatMoney(row.cash + row.bank)}`).join("\n") : "Aún no hay datos.";
    return new EmbedBuilder().setColor(0xf1c40f).setTitle("Ranking económico").setDescription(description);
}

export async function execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;
    const action = interaction.options.getSubcommand();
    const amount = interaction.options.getInteger("cantidad") ?? 0;
    if (action === "balance") return void interaction.editReply({ embeds: [await balance(interaction.guildId, interaction.options.getUser("usuario") ?? interaction.user)] });
    if (action === "deposit" || action === "withdraw") return void interaction.editReply(await moveMoney(interaction.guildId, interaction.user.id, amount, action === "deposit"));
    if (action === "daily") return void interaction.editReply(await daily(interaction.guildId, interaction.user.id));
    if (action === "work") return void interaction.editReply(await work(interaction.guildId, interaction.user.id));
    if (action === "pay") return void interaction.editReply(await pay(interaction.guildId, interaction.user.id, interaction.options.getUser("usuario", true), amount));
    if (action === "coinflip") return void interaction.editReply(await coinflip(interaction.guildId, interaction.user.id, amount, interaction.options.getString("eleccion", true)));
    if (action === "slots") return void interaction.editReply(await slots(interaction.guildId, interaction.user.id, amount));
    if (action === "leaderboard") return void interaction.editReply({ embeds: [await leaderboard(interaction.guildId)] });
}

export async function executePrefix(message: Message, args: string[]) {
    const guildId = message.guild!.id;
    const action = args.shift()?.toLowerCase() ?? "balance";
    if (["balance", "bal", "saldo"].includes(action)) return void message.reply({ embeds: [await balance(guildId, message.mentions.users.first() ?? message.author)] });
    if (["deposit", "dep", "depositar", "withdraw", "with", "retirar"].includes(action)) {
        const economy = await getEconomy(message.author.id, guildId);
        const toBank = ["deposit", "dep", "depositar"].includes(action);
        const amount = parseAmount(args[0], toBank ? economy.cash : economy.bank);
        return void message.reply(amount ? await moveMoney(guildId, message.author.id, amount, toBank) : "Indica una cantidad válida.");
    }
    if (action === "daily") return void message.reply(await daily(guildId, message.author.id));
    if (action === "work") return void message.reply(await work(guildId, message.author.id));
    if (action === "pay") { const user = await resolveUserFromArgs(message, args); const amount = parseAmount(args[1], 0); return void message.reply(user && amount ? await pay(guildId, message.author.id, user, amount) : "Uso: economy pay @usuario cantidad"); }
    if (action === "coinflip") { const amount = parseAmount(args[0], 0); const choice = args[1]?.toLowerCase(); return void message.reply(amount && (choice === "cara" || choice === "sello") ? await coinflip(guildId, message.author.id, amount, choice) : "Uso: economy coinflip cantidad cara|sello"); }
    if (action === "slots") { const amount = parseAmount(args[0], 0); return void message.reply(amount ? await slots(guildId, message.author.id, amount) : "Uso: economy slots cantidad"); }
    if (["leaderboard", "top", "ranking"].includes(action)) return void message.reply({ embeds: [await leaderboard(guildId)] });
    return void message.reply("Acciones: balance, deposit, withdraw, daily, work, pay, coinflip, slots, leaderboard.");
}
