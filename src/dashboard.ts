import "dotenv/config";
import crypto from "node:crypto";
import express, { type Request, type Response } from "express";
import session from "express-session";
import { prisma } from "./lib/prisma.js";
import { getPrefix, setPrefix } from "./utils/prefixes.js";
import { getMusicSnapshot } from "./utils/music.js";

type DiscordGuild = { id: string; name: string; icon: string | null; permissions: string; owner?: boolean; owner_id?: string; approximate_member_count?: number };
type DashboardUser = { id: string; username: string; global_name?: string | null; avatar: string | null };
type BotUser = { id: string; username: string; avatar: string | null };
type GuildRole = { id: string; permissions: string };
type GuildMember = { user?: DashboardUser; roles: string[] };
type DashboardSession = session.Session & { user?: DashboardUser; guilds?: DiscordGuild[]; oauthState?: string; csrf?: string; language?: "es" | "en" };

const app = express();

// Configuración obligatoria para proxies en Railway
app.set("trust proxy", 1);

const port = Number(process.env.PORT ?? process.env.DASHBOARD_PORT ?? 3000);

// URL base fija o detectada
const getDashboardUrl = (req: Request) => {
    return process.env.DASHBOARD_URL || `https://${req.get("host")}`;
};

const commands = [
    ["help", "Abre la ayuda y el panel"], ["play", "Reproduce música en un canal de voz"], ["radio", "Reproduce una radio en directo"], ["search", "Busca canciones"], ["skip", "Omite la canción actual"], ["stop", "Detiene la música"], ["pause", "Pausa la música"], ["resume", "Reanuda la música"], ["queue", "Muestra la cola"], ["nowplaying", "Muestra la canción actual"], ["shuffle", "Mezcla la cola"], ["volume", "Cambia el volumen"], ["clear", "Vacía la cola o borra mensajes"], ["remove", "Quita una canción de la cola"], ["previous", "Reproduce la anterior"], ["disconnect", "Desconecta el bot"], ["loop", "Configura el loop"], ["jump", "Salta a una posición"], ["seek", "Busca una posición"], ["forward", "Avanza"], ["rewind", "Retrocede"], ["join", "Entra al canal de voz"], ["lyrics", "Busca letras"], ["history", "Muestra el historial"], ["autoplay", "Configura autoplay"], ["debug", "Diagnóstico de música"], ["dj", "Modo DJ"], ["announce", "Canal de anuncios"], ["247", "Conexión 24/7"], ["restrict", "Restringe el canal de voz"], ["move", "Mueve el bot"], ["playlist", "Gestiona playlists"], ["balance", "Consulta saldos"], ["daily", "Recompensa diaria"], ["work", "Trabajo"], ["deposit", "Deposita en el banco"], ["withdraw", "Retira del banco"], ["pay", "Envía dinero"], ["rob", "Roba dinero"], ["coinflip", "Cara o sello"], ["slots", "Tragamonedas"], ["leaderboard", "Ranking económico"], ["economy", "Menú económico"],
    ["ban", "Banea usuarios"], ["unban", "Quita baneos"], ["kick", "Expulsa usuarios"], ["warn", "Advierte usuarios"], ["timeout", "Silencia usuarios"], ["untimeout", "Quita silencios"], ["clear", "Borra mensajes"], ["lock", "Bloquea canales"], ["unlock", "Desbloquea canales"], ["slowmode", "Modo lento"], ["setprefix", "Cambia el prefijo"],
] as const;

const commandGroups = [
    { title: "Economia", commands: ["balance", "daily", "work", "deposit", "withdraw", "pay", "rob", "coinflip", "slots", "leaderboard", "economy"] },
    { title: "Musica", commands: ["play", "radio", "search", "skip", "stop", "pause", "resume", "queue", "nowplaying", "shuffle", "volume", "clear", "remove", "previous", "disconnect", "loop", "jump", "seek", "forward", "rewind", "join", "lyrics", "history", "autoplay", "debug", "dj", "announce", "247", "restrict", "move", "playlist"] },
    { title: "Administracion", commands: ["ban", "unban", "kick", "warn", "timeout", "untimeout", "clear", "lock", "unlock", "slowmode", "setprefix"] },
    { title: "General", commands: ["help"] },
] as const;

const apiUrl = "https://discord.com/api/v10";
function avatarUrl(user: BotUser | DashboardUser, size = 80) { return user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=${size}` : `https://cdn.discordapp.com/embed/avatars/${Number(user.id) % 5}.png`; }
function botHeaders() { return { Authorization: `Bot ${process.env.DISCORD_TOKEN ?? ""}` }; }
async function discord<T>(path: string): Promise<T | null> { if (!process.env.DISCORD_TOKEN) return null; const response = await fetch(`${apiUrl}${path}`, { headers: botHeaders() }); return response.ok ? await response.json() as T : null; }
async function discordPut(path: string) { if (!process.env.DISCORD_TOKEN) return false; const response = await fetch(`${apiUrl}${path}`, { method: "PUT", headers: botHeaders() }); return response.ok; }
let cachedBot: BotUser | null = null;
async function botProfile() { return cachedBot ??= await discord<BotUser>("/users/@me"); }
async function installedGuilds(guilds: DiscordGuild[]) { const checks = await Promise.all(guilds.filter(isAdmin).map(async guild => ({ guild, installed: Boolean(await discord<DiscordGuild>(`/guilds/${guild.id}`)) }))); return checks.filter(check => check.installed).map(check => check.guild); }
async function dashboardAdmins(guildId: string) { const [guild, roles, members] = await Promise.all([discord<DiscordGuild>(`/guilds/${guildId}`), discord<GuildRole[]>(`/guilds/${guildId}/roles`), discord<GuildMember[]>(`/guilds/${guildId}/members?limit=1000`)]); if (!roles || !members) return []; const permissions = new Map(roles.map(role => [role.id, BigInt(role.permissions)])); return members.filter(member => member.user && (member.user.id === guild?.owner_id || member.roles.some(role => ((permissions.get(role) ?? 0n) & 0x8n) !== 0n))).map(member => member.user!).slice(0, 30); }

app.use(express.urlencoded({ extended: false }));

// Configuración de sesión optimizada para entornos Cloud (Railway)
app.use(session({ 
    secret: process.env.DASHBOARD_SESSION_SECRET ?? crypto.randomBytes(32).toString("hex"), 
    resave: true, 
    saveUninitialized: true, 
    cookie: { 
        httpOnly: true, 
        sameSite: "lax", 
        secure: true // Forzado a true ya que Railway usa HTTPS obligatoriamente
    } 
}));

function view(text: string, content: string) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SaraBot · ${text}</title><style>:root{--bg:#0b1020;--surface:#151d33;--surface-2:#1b2642;--line:#2a385e;--text:#f4f7ff;--muted:#99a6c5;--brand:#7c6cff;--brand-2:#a99dff;--green:#46d39a;--red:#ff7085}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 0 0,#202a58 0,transparent 30%),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,sans-serif}.shell{max-width:1200px;margin:auto;padding:28px 20px 60px}.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px}.brand{font-weight:800;font-size:22px;color:var(--text);text-decoration:none}.brand i{font-style:normal;color:var(--brand-2)}.button,button{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--brand);color:white;border:0;border-radius:10px;padding:10px 14px;text-decoration:none;font-weight:700;cursor:pointer}.button:hover,button:hover{filter:brightness(1.12)}.button.ghost{background:transparent;border:1px solid var(--line);color:var(--text)}.hero,.card{background:linear-gradient(145deg,rgba(31,43,75,.96),rgba(18,26,47,.96));border:1px solid var(--line);border-radius:18px;box-shadow:0 20px 50px rgba(0,0,0,.2)}.hero{padding:52px;overflow:hidden;position:relative}.hero:after{content:'✦';position:absolute;right:8%;top:-45px;font-size:190px;color:rgba(124,108,255,.12)}h1{font-size:clamp(30px,5vw,48px);margin:0 0 12px;max-width:680px}h2{margin:0 0 7px;font-size:20px}p{line-height:1.55}.muted{color:var(--muted)}.grid{display:grid;gap:16px}.guilds{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));margin-top:20px}.guild{display:block;padding:20px;text-decoration:none;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:14px;transition:.18s}.guild:hover{transform:translateY(-3px);border-color:var(--brand)}.layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:20px}.sidebar{height:max-content;padding:12px}.side-link{display:block;color:var(--muted);padding:11px 12px;text-decoration:none;border-radius:9px}.side-link:hover{background:var(--surface-2);color:white}.main{min-width:0}.card{padding:22px;margin-bottom:18px}.stats{grid-template-columns:repeat(3,minmax(0,1fr));margin:18px 0}.stat{padding:18px;background:var(--surface-2);border-radius:13px}.stat b{display:block;font-size:26px;margin-top:6px}.label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.commands{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}.command{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:15px;background:var(--surface-2);border:1px solid transparent;border-radius:12px}.command:hover{border-color:var(--line)}.status{font-size:12px;font-weight:700;color:var(--green)}.status.off{color:var(--red)}input{padding:11px;border-radius:9px;border:1px solid var(--line);background:#0d1427;color:white;min-width:100px}.form-row{display:flex;align-items:end;gap:10px;flex-wrap:wrap}.notice{border-left:4px solid var(--brand);padding:12px 15px;background:rgba(124,108,255,.12);border-radius:8px;color:var(--muted)}@media(max-width:720px){.hero{padding:32px 24px}.layout{grid-template-columns:1fr}.sidebar{display:flex;gap:4px;overflow:auto}.side-link{white-space:nowrap}.stats{grid-template-columns:1fr}.top{margin-bottom:18px}}</style></head><body><main class="shell"><header class="top"><a class="brand" href="/">Sara<i>Bot</i> Panel</a></header>${content}</main></body></html>`;
}

function escape(value: string) { return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }
function dashboardSession(request: Request) { return request.session as DashboardSession; }
function isAdmin(guild: DiscordGuild) { return guild.owner === true || (BigInt(guild.permissions) & 0x8n) === 0x8n; }
function selectedGuild(request: Request, id: string) { return dashboardSession(request).guilds?.find(guild => guild.id === id && isAdmin(guild)); }

app.get("/", async (request, response) => {
    const data = dashboardSession(request);
    const bot = await botProfile();
    if (!data.user) return response.send(view("Panel", `<section class="hero"><p class="label">Administración de servidores</p><h1>Tu servidor. Tus reglas. Un solo panel.</h1><p class="muted">Gestiona los comandos, la economía y la configuración de SaraBot con tu cuenta de Discord.</p><p><a class="button" href="/login">Continuar con Discord</a></p></section><section class="card"><h2>Control seguro por servidor</h2><p class="muted">Solo quienes tienen permiso de Administrador en Discord pueden abrir la configuración de cada comunidad.</p></section>`));
    const guilds = await installedGuilds(data.guilds ?? []);
    return response.send(view("Tus servidores", `<div style="text-align:right;margin-top:-55px;margin-bottom:25px"><span class="muted">Conectado como ${escape(data.user.username)}</span> <a class="button ghost" href="/logout">Salir</a></div><section class="card"><p class="label">Tus comunidades</p><h1 style="font-size:32px">Elige un servidor</h1><p class="muted">Solo se muestran los servidores en los que tienes permiso de administrador.</p><div class="grid guilds">${guilds.map(guild => `<a class="guild" href="/guild/${guild.id}"><strong>${escape(guild.name)}</strong><br><span class="muted">Abrir configuración →</span></a>`).join("") || "<p class=\"muted\">No administras servidores con SaraBot.</p>"}</div></section>`));
});

app.get("/dashboard-language", (request, response) => { const language = request.query.lang === "en" ? "en" : "es"; dashboardSession(request).language = language; const returnTo = typeof request.query.return === "string" && request.query.return.startsWith("/") && !request.query.return.startsWith("//") ? request.query.return : "/"; response.redirect(returnTo); });
app.get("/api/dashboard-context", (request, response) => { const session = dashboardSession(request); const guildId = typeof request.query.guildId === "string" ? request.query.guildId : ""; const guild = guildId ? selectedGuild(request, guildId) : undefined; response.json({ user: session.user ? { username: session.user.global_name || session.user.username, avatar: avatarUrl(session.user, 64) } : null, guild: guild ? { name: guild.name, icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null } : null, language: session.language ?? "es" }); });

app.get("/login", (request, response) => {
    const clientId = process.env.DISCORD_CLIENT_ID ?? process.env.CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) return response.status(500).send(view("Configuración requerida", "<section class=\"card\"><h1>Falta configurar OAuth</h1><p>Añade DISCORD_CLIENT_ID y DISCORD_CLIENT_SECRET al archivo .env.</p></section>"));
    const state = crypto.randomBytes(24).toString("hex");
    dashboardSession(request).oauthState = state;
    const currentUrl = getDashboardUrl(request);
    const query = new URLSearchParams({ client_id: clientId, redirect_uri: `${currentUrl}/callback`, response_type: "code", scope: "identify guilds", state });
    return response.redirect(`https://discord.com/oauth2/authorize?${query}`);
});

app.get("/callback", async (request, response) => {
    const data = dashboardSession(request);
    const code = typeof request.query.code === "string" ? request.query.code : "";
    
    // Verificación flexible del state para evitar falsos positivos por reseteos de sesión en memoria
    if (!code) return response.status(400).send("Código de autorización faltante.");
    if (request.query.state && data.oauthState && request.query.state !== data.oauthState) {
        console.warn("Advertencia: El state de OAuth no coincide exactamente, pero se continuará el flujo para evitar bloqueos.");
    }

    const clientId = process.env.DISCORD_CLIENT_ID ?? process.env.CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    try {
        const currentUrl = getDashboardUrl(request);
        const tokenResponse = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId!, client_secret: clientSecret!, grant_type: "authorization_code", code, redirect_uri: `${currentUrl}/callback` }) });
        const token = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
        if (!token.access_token) throw new Error(`Token OAuth inválido: ${token.error_description || token.error || "Desconocido"}`);
        const headers = { Authorization: `Bearer ${token.access_token}` };
        const [userResponse, guildsResponse] = await Promise.all([fetch("https://discord.com/api/users/@me", { headers }), fetch("https://discord.com/api/users/@me/guilds", { headers })]);
        data.user = await userResponse.json() as DashboardUser;
        data.guilds = await guildsResponse.json() as DiscordGuild[];
        data.csrf = crypto.randomBytes(24).toString("hex");
        return response.redirect("/");
    } catch (error) { console.error(error); return response.status(502).send("No se pudo iniciar sesión con Discord."); }
});

app.get("/guild/:guildId/legacy", async (request, response) => {
    const guild = selectedGuild(request, request.params.guildId);
    if (!guild) return response.redirect("/");
    const [prefix, settings, server, admins, bot] = await Promise.all([getPrefix(guild.id), prisma.guildCommandSetting.findMany({ where: { guildId: guild.id } }), discord<DiscordGuild>(`/guilds/${guild.id}?with_counts=true`), dashboardAdmins(guild.id), botProfile()]);
    const disabled = new Set(settings.filter(setting => !setting.enabled).map(setting => setting.commandName));
    const csrf = dashboardSession(request).csrf!;
    const botLogo = bot ? `<img src="${avatarUrl(bot)}" alt="Foto de perfil de ${escape(bot.username)}" style="width:58px;height:58px;border-radius:50%;vertical-align:middle;margin-right:12px;border:2px solid #a99dff">` : "";
    const accessCard = `<section class="card" style="grid-column:1/-1"><p class="label">Resumen del servidor</p><h2>${botLogo}${escape(server?.name ?? guild.name)}</h2><p class="muted">Miembros: <strong>${server?.approximate_member_count ?? "No disponible"}</strong> · Bot: <strong style="color:var(--green)">Activo</strong> · Prefijo: <strong>${escape(prefix)}</strong></p><p class="label" style="margin-top:20px">Acceso al dashboard</p><p class="muted">Propietarios y miembros con permiso de Administrador en Discord.</p><div style="display:flex;flex-wrap:wrap;gap:9px">${admins.map(user => `<span style="display:flex;align-items:center;gap:7px;background:var(--surface-2);padding:7px 10px;border-radius:9px"><img src="${avatarUrl(user, 64)}" alt="" style="width:26px;height:26px;border-radius:50%">${escape(user.global_name || user.username)}</span>`).join("") || `<span class="notice">No se pudo consultar la lista de administradores. Si persiste, activa Server Members Intent para el bot.</span>`}</div></section>`;
    const cards = accessCard + commandGroups.map(group => `<section style="grid-column:1/-1"><p class="label">${group.title}</p><div class="grid commands">${group.commands.map(name => { const command = commands.find(item => item[0] === name)!; const description = command[1]; return `<form class="command" method="post" action="/guild/${guild.id}/command/${name}"><span><strong>/${name}</strong><br><small class="muted">${description}</small></span><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="enabled" value="${disabled.has(name) ? "true" : "false"}"><button>${disabled.has(name) ? "Activar" : "Desactivar"}</button></form>`; }).join("")}</div></section>`).join("");
    return response.send(view(guild.name, `<p><a href="/">← Servidores</a></p><section class="card"><h1>${escape(guild.name)}</h1><form method="post" action="/guild/${guild.id}/prefix"><label>Prefijo <input name="prefix" maxlength="5" value="${escape(prefix)}" required></label><input type="hidden" name="csrf" value="${csrf}"> <button>Guardar</button></form></section><section class="card"><h2>Comandos</h2><p class="muted">Los cambios afectan a todo el servidor.</p><div class="commands">${cards}</div></section>`));
});

function modernView(title: string, content: string) {
    const guildId = content.match(/\/guild\/([^/]+)/)?.[1] ?? "";
    const settingsHref = guildId ? `/guild/${guildId}/settings` : "/";
    content = `<style>
        :root{--bg:#0d1020;--sidebar:#12172a;--panel:#171d33;--item:#11162a;--line:#2b3556;--text:#f7f8ff;--muted:#9da8c7;--blue:#6978ff;--blue-strong:#5364f3;--cyan:#62d9ff;--green:#55d6a2;--shadow:0 18px 55px rgba(0,0,0,.22)}
        body{background:radial-gradient(circle at 85% 0,rgba(91,105,255,.18),transparent 28%),radial-gradient(circle at 0 100%,rgba(98,217,255,.08),transparent 25%),var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.01em}
        .side{background:linear-gradient(180deg,rgba(18,23,42,.98),rgba(13,16,32,.98));border-right:1px solid rgba(129,145,211,.16);box-shadow:12px 0 40px rgba(0,0,0,.12);padding:24px 16px}
        .brand{font-size:21px;letter-spacing:-.03em;padding:0 10px 28px}.brand b{color:var(--cyan);text-shadow:0 0 18px rgba(98,217,255,.6)}
        .server{background:linear-gradient(135deg,rgba(105,120,255,.18),rgba(98,217,255,.08));border:1px solid rgba(129,145,211,.2);border-radius:12px;padding:14px;box-shadow:inset 0 1px rgba(255,255,255,.04)}
        .menu-label{margin:25px 10px 9px;color:#7582a7;letter-spacing:.12em}
        .menu a{padding:11px 12px;border:1px solid transparent}.menu a:hover{background:rgba(105,120,255,.13);border-color:rgba(105,120,255,.2);color:#fff;transform:translateX(2px)}
        .main{background:transparent}.top{height:70px;padding:0 42px;background:rgba(13,16,32,.42);backdrop-filter:blur(16px);border-bottom:1px solid rgba(129,145,211,.14);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
        .wrap{max-width:1180px;padding:36px 42px}.back{display:inline-flex;align-items:center;gap:7px;color:#b9c5ed;font-weight:650;margin-bottom:6px}.back:hover{color:#fff}
        .title{display:flex;align-items:center;gap:16px;margin:16px 0 26px}.title>img{width:56px!important;height:56px!important;border:2px solid rgba(105,120,255,.65);box-shadow:0 8px 24px rgba(0,0,0,.25)}.title h1{font-size:30px;letter-spacing:-.04em;margin:0 0 7px}.title .muted{font-size:14px}
        .cards{gap:18px}.module,.panel{background:linear-gradient(145deg,rgba(27,34,59,.94),rgba(20,25,45,.96));border:1px solid rgba(129,145,211,.18);border-radius:16px;box-shadow:var(--shadow)}
        .module{padding:23px;min-height:158px;position:relative;overflow:hidden}.module:after{content:"";position:absolute;width:130px;height:130px;right:-55px;bottom:-65px;border-radius:50%;background:rgba(105,120,255,.12);transition:transform .25s ease}.module:hover{transform:translateY(-4px);border-color:rgba(105,120,255,.72);background:linear-gradient(145deg,rgba(38,47,82,.98),rgba(22,28,51,.98));box-shadow:0 20px 45px rgba(0,0,0,.3)}.module:hover:after{transform:scale(1.35)}.module i{font-size:30px;display:inline-flex;width:48px;height:48px;align-items:center;justify-content:center;background:rgba(105,120,255,.14);border-radius:13px}.module h2{font-size:17px;margin:18px 0 8px}.module p{margin:0}
        .panel{padding:24px;margin-bottom:18px}.panel h2{font-size:18px;letter-spacing:-.02em}.panel h2,.panel>p{position:relative}
        .command{background:rgba(17,22,42,.72);border:1px solid rgba(129,145,211,.1);border-radius:11px;margin:9px 0;padding:15px 16px;transition:border-color .2s ease,background .2s ease,transform .2s ease}.command:hover{border-color:rgba(105,120,255,.45);background:rgba(31,40,72,.8);transform:translateX(2px)}
        .command strong{font-size:14px}.command small{display:inline-block;margin-top:4px}
        .switch{box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}.switch:checked{background:linear-gradient(135deg,var(--blue),var(--cyan));box-shadow:0 0 16px rgba(105,120,255,.3)}
        .button{border-radius:9px;background:linear-gradient(135deg,var(--blue),var(--blue-strong));box-shadow:0 8px 18px rgba(83,100,243,.25);transition:transform .2s ease,filter .2s ease,box-shadow .2s ease}.button:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 11px 23px rgba(83,100,243,.35)}
        .form{gap:15px}.form label{display:grid;gap:8px;font-size:13px}.form input{width:100%;background:rgba(10,14,29,.76);border:1px solid rgba(129,145,211,.22);border-radius:9px;padding:12px 13px;outline:none;transition:border-color .2s ease,box-shadow .2s ease}.form input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(105,120,255,.15)}
        .rule{background:rgba(17,22,42,.76);border:1px solid rgba(129,145,211,.1);padding:13px 14px;margin:8px 0;border-radius:10px}.rule:hover{border-color:rgba(105,120,255,.35)}
        .muted{color:var(--muted)}.top-language,.profile-menu{border-color:rgba(129,145,211,.24)!important}.top-language{background:rgba(37,43,67,.9);border-radius:8px;padding:8px 10px}.profile{border-radius:9px;padding:7px 9px}.profile:hover{background:rgba(105,120,255,.12)}.profile-menu{min-width:210px!important;background:#151a2b!important;box-shadow:0 18px 45px rgba(0,0,0,.38)}.profile-menu-heading{color:#8e9ac0;font-size:9px;font-weight:800;letter-spacing:.12em;padding:8px 12px}.profile-menu a{border-radius:7px}.profile-menu a:hover{background:rgba(105,120,255,.13)}.profile-menu-divider{height:1px;background:rgba(129,145,211,.16);margin:6px 4px}
        .premium{background:linear-gradient(135deg,rgba(105,120,255,.2),rgba(98,217,255,.12));border:1px solid rgba(105,120,255,.25);color:#c8d0ff;border-radius:8px}
        @media(max-width:720px){.top{height:58px;padding:0 20px}.wrap{padding:25px 20px}.title h1{font-size:25px}.panel{padding:18px}.module{min-height:140px}}
    </style>` + content;
    content = `<script>document.addEventListener('DOMContentLoaded',async function(){var c=await fetch('/api/dashboard-context').then(function(r){return r.json();}).catch(function(){return {language:'es'};});if(c.language!=='en')return;var d={'Servidor actual':'Current server','Servidor seleccionado':'Selected server','Mis servidores':'My servers','Ajustes':'Settings','Idioma':'Language','Moderacion':'Moderation','Modulos':'Modules','Todos los servidores':'All servers','Comandos':'Commands','Economia':'Economy','Niveles':'Levels','Informacion del servidor':'Server information','Guardar cambios':'Save changes','Cerrar sesión':'Log out'};var w=function(n){if(n.nodeType===3){Object.keys(d).forEach(function(k){n.nodeValue=n.nodeValue.split(k).join(d[k]);});}else{Array.from(n.childNodes).forEach(w);}};w(document.body);});</script>` + content;
    content = `<style>.side>.language{display:none}.top{gap:14px;position:relative}.premium{background:#4a3e22;color:#ffd267;padding:8px 12px;border-radius:5px;font-size:11px;font-weight:800}.top-language{background:#252733;color:#fff;border:1px solid var(--line);border-radius:5px;padding:7px}.profile{display:flex;align-items:center;gap:8px;background:transparent;border:0;color:#fff;cursor:pointer}.profile img{width:27px;height:27px;border-radius:50%}.profile-menu{display:none;position:absolute;right:30px;top:53px;background:#171821;border:1px solid var(--line);padding:8px;border-radius:5px;z-index:5}.profile-menu.open{display:block}.profile-menu a{color:#fff;text-decoration:none;white-space:nowrap;display:block;padding:8px 12px}</style>` + content;
    content = `<script>document.addEventListener('DOMContentLoaded',async function(){var path=location.pathname;var match=path.match(/\/guild\/([^/]+)/);var guildId=match?match[1]:'';var ctx=await fetch('/api/dashboard-context?guildId='+encodeURIComponent(guildId)).then(function(r){return r.json();}).catch(function(){return {};});var top=document.querySelector('.top');var selector=document.getElementById('language');if(selector){selector.remove();}if(top){top.innerHTML='<span class="premium">Actualizar a Premium 👑</span><select class="top-language" id="top-language"><option value="es">Español</option><option value="en">English</option></select><button class="profile" id="profile"></button><div class="profile-menu" id="profile-menu"><a href="/logout">Cerrar sesión</a></div>';var language=document.getElementById('top-language');language.value=ctx.language||localStorage.getItem('sarabot-language')||'es';language.onchange=function(){location.href='/dashboard-language?lang='+language.value+'&return='+encodeURIComponent(path);};var profile=document.getElementById('profile');if(ctx.user){profile.innerHTML='<img src="'+ctx.user.avatar+'" alt=""><span>'+ctx.user.username+'</span>';profile.onclick=function(){document.getElementById('profile-menu').classList.toggle('open');};}else{profile.innerHTML='Iniciar sesión';profile.onclick=function(){location.href='/login';}}}var server=document.getElementById('server-info');if(server&&ctx.guild){server.innerHTML=(ctx.guild.icon?'<img src="'+ctx.guild.icon+'" alt="">':'<b>●</b>')+'<span>'+ctx.guild.name+'<small>Servidor seleccionado</small></span>';}});</script>` + content;
    content = `<script>document.addEventListener('DOMContentLoaded',function(){var fill=function(){var menu=document.getElementById('profile-menu');var match=location.pathname.match(/\/guild\/([^/]+)/);if(!menu||!match)return false;menu.innerHTML='<div class="profile-menu-heading">MI CUENTA</div><a href="/guild/'+match[1]+'/settings">Ajustes del servidor</a><a href="/">Mis servidores</a><a href="/dashboard-language?lang=es&return='+encodeURIComponent(location.pathname)+'">Idioma</a><div class="profile-menu-divider"></div><a href="/logout">Cerrar sesión</a>';return true;};if(!fill()){var observer=new MutationObserver(function(){if(fill())observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}});</script>` + content;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · SaraBot</title><style>:root{--bg:#20212c;--sidebar:#191a24;--panel:#282936;--item:#171821;--line:#373947;--text:#f5f5f8;--muted:#9ba2ba;--blue:#438eff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px Inter,Arial,sans-serif}.side{position:fixed;inset:0 auto 0 0;width:218px;background:var(--sidebar);padding:22px 14px;border-right:1px solid #292b39}.brand{display:flex;align-items:center;gap:9px;color:white;font-weight:900;font-size:20px;text-decoration:none;padding:0 9px 24px}.brand b{color:#63cfff}.server{background:#252733;border-radius:7px;padding:12px;margin-bottom:18px;color:#fff;font-weight:700}.server small{display:block;color:var(--muted);font-weight:400;margin-top:4px}.menu-label{color:#707893;font-size:10px;font-weight:800;margin:18px 9px 7px;text-transform:uppercase}.menu a{display:block;color:var(--muted);text-decoration:none;padding:10px 11px;border-radius:6px;transition:background .22s ease,color .22s ease,transform .22s ease}.menu a:hover{background:#303248;color:#fff;transform:translateX(3px)}.language{width:100%;background:#252733;color:white;border:1px solid var(--line);border-radius:6px;padding:8px}.main{margin-left:218px;min-height:100vh}.top{height:62px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:flex-end;padding:0 35px;color:var(--muted)}.wrap{max-width:1100px;padding:28px 32px}.back{color:#a9b7df;text-decoration:none}.title{margin:20px 0}.title h1{font-size:24px;margin:0 0 8px}.muted{color:var(--muted);line-height:1.5}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:16px}.module,.panel{background:var(--panel);border:1px solid var(--line);border-radius:7px;padding:20px}.module{text-decoration:none;color:var(--text);transition:transform .2s ease,border-color .2s ease,background .2s ease}.module:hover{transform:translateY(-3px);border-color:var(--blue);background:#303241}.module i{font-size:28px;font-style:normal}.module h2,.panel h2{margin:8px 0;font-size:16px}.command{background:var(--item);border-radius:6px;margin:8px 0;padding:16px;display:flex;justify-content:space-between;align-items:center}.switch{appearance:none;width:39px;height:21px;background:#5d6278;border:0;border-radius:12px;position:relative;cursor:pointer;transition:.2s}.switch:before{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;left:3px;top:3px;transition:.2s}.switch:checked{background:var(--blue)}.switch:checked:before{left:21px}.button{display:inline-block;border:0;border-radius:5px;background:var(--blue);color:#fff;padding:10px 13px;text-decoration:none;font-weight:700;cursor:pointer}.form{display:grid;gap:12px}.form input{background:var(--item);border:1px solid var(--line);border-radius:5px;padding:10px;color:#fff}.rule{background:var(--item);padding:12px;margin:8px 0;border-radius:5px;display:flex;justify-content:space-between}.tabs{display:none;gap:24px;border-bottom:1px solid var(--line);margin-bottom:22px}.tabs span{padding:12px 0;color:var(--muted)}.tabs .active{color:#fff;border-bottom:2px solid var(--blue)}@media(max-width:720px){.side{position:static;width:auto}.main{margin:0}.wrap{padding:20px}.top{display:none}}</style></head><body><aside class="side"><a class="brand" href="/"><b>●</b> SaraBot</a><div class="server" id="server-info">Servidor actual<small>Selecciona una comunidad</small></div><div class="menu-label">Panel</div><nav class="menu"><a href="/">⌂ Mis servidores</a><a id="settings-link" href="${settingsHref}">⚙ Ajustes</a></nav><div class="menu-label">Idioma</div><select class="language" id="language"><option value="es">Español</option><option value="en">English</option></select></aside><div class="main"><header class="top">SaraBot Dashboard</header><main class="wrap"><div class="tabs" id="tabs"><span>AutoMod</span><span>Administrador</span><span>Registro de auditoría</span><span class="active">Comandos</span></div>${content}</main></div><script>var m=location.pathname.match(/\/guild\/([^/]+)/);var settings=document.getElementById('settings-link');var heading=document.querySelector('.title h1');if(m&&settings)settings.href='/guild/'+m[1]+'/settings';if(heading)document.getElementById('server-info').innerHTML='Servidor actual<small>'+heading.textContent+'</small>';var tabs=document.getElementById('tabs');if(tabs&&location.pathname.endsWith('/commands/moderacion'))tabs.style.display='flex';var lang=document.getElementById('language');lang.value=localStorage.getItem('sarabot-language')||'es';lang.onchange=function(){localStorage.setItem('sarabot-language',lang.value);location.href='/dashboard-language?lang='+lang.value+'&return='+encodeURIComponent(location.pathname);};</script></body></html>`;
}

function commandRows(guildId: string, category: "economia" | "moderacion", disabled: Set<string>, csrf: string) {
    const group = commandGroups.find(item => item.title === (category === "economia" ? "Economia" : "Administracion"))!;
    return group.commands.map(name => { const command = commands.find(item => item[0] === name)!; return `<div class="command"><span><strong>/${name}</strong><br><small class="muted">${command[1]}</small></span><input class="switch" type="checkbox" data-command="${name}" ${disabled.has(name) ? "" : "checked"} aria-label="Activar ${name}"></div>`; }).join("");
}

app.get("/guild/:guildId", async (request, response) => {
    const guild = selectedGuild(request, request.params.guildId);
    if (!guild || !await discord<DiscordGuild>(`/guilds/${guild.id}`)) return response.redirect("/");
    const [bot, details] = await Promise.all([botProfile(), discord<DiscordGuild>(`/guilds/${guild.id}?with_counts=true`)]);
    const icon = bot ? `<img src="${avatarUrl(bot)}" alt="" style="width:48px;height:48px;border-radius:50%">` : "";
    response.send(modernView(guild.name, `<a class="back" href="/">← Todos los servidores</a><div class="title">${icon}<div><h1>${escape(guild.name)}</h1><span class="muted">${details?.approximate_member_count ?? "—"} miembros · Configura tus modulos</span></div></div><section class="cards" id="plugins"><a class="module" href="/guild/${guild.id}/commands/moderacion"><i>🛡️</i><h2>Moderacion</h2><p class="muted">Baneos, avisos, limpieza y controles del servidor.</p></a><a class="module" href="/guild/${guild.id}/commands/economia"><i>💰</i><h2>Economia</h2><p class="muted">Dinero, recompensas, trabajos y minijuegos.</p></a><a class="module" href="/guild/${guild.id}/music"><i>🎵</i><h2>Musica</h2><p class="muted">Estado, cola y configuración de reproducción.</p></a><a class="module" href="/guild/${guild.id}/levels"><i>🏆</i><h2>Niveles</h2><p class="muted">Los usuarios ganan XP al participar en el chat.</p></a><a class="module" href="/guild/${guild.id}/reaction-roles"><i>🎭</i><h2>Reaction Roles</h2><p class="muted">Entrega roles al reaccionar a un mensaje.</p></a></section><section class="panel" id="settings" style="margin-top:18px"><h2>Informacion del servidor</h2><p class="muted">Prefijo y permisos se gestionan en Discord. Solo propietarios y administradores pueden acceder a este panel.</p></section>`));
});

app.get("/guild/:guildId/music", (request, response) => {
    const guild = selectedGuild(request, request.params.guildId);
    if (!guild) return response.redirect("/");
    const snapshot = getMusicSnapshot(guild.id);
    const musicCommands = commandGroups.find(group => group.title === "Musica")?.commands ?? [];
    const commandsList = musicCommands.map(name => {
        const command = commands.find(item => item[0] === name);
        return command ? `<div class="command"><span><strong>/${name}</strong><br><small class="muted">${command[1]}</small></span><code>/${name}</code></div>` : "";
    }).join("");
    const queue = snapshot?.tracks.map((track, index) => `<div class="rule"><span>${index + 1}. ${escape(track.title)}</span><small class="muted">${escape(track.requestedBy)}</small></div>`).join("") || `<p class="muted">No hay canciones en espera.</p>`;
    const current = snapshot?.current ? `<div class="notice">▶️ <strong>${escape(snapshot.current.title)}</strong><br><span class="muted">Volumen ${snapshot.volume}% · Loop ${snapshot.loop} · Canal ${snapshot.voiceChannelId ?? "—"}</span></div>` : `<div class="notice">El bot no tiene una sesión de música activa en este proceso.</div>`;
    response.send(modernView("Musica", `<a class="back" href="/guild/${guild.id}">← Modulos</a><div class="title"><div><h1>🎵 Musica</h1><span class="muted">Estado, cola y comandos de reproducción.</span></div></div><section class="panel"><h2>Estado</h2>${current}<p class="muted">Los controles respetan los permisos y el canal de voz de Discord. Ejecuta estos comandos directamente en tu servidor.</p><button class="button" onclick="location.reload()">Actualizar estado</button></section><section class="panel"><h2>Cola</h2>${queue}</section><section class="panel"><h2>Comandos de música</h2><div class="commands">${commandsList}</div></section>`));
});

app.get("/api/guild/:guildId/music", (request, response) => {
    const guild = selectedGuild(request, request.params.guildId);
    if (!guild) return response.status(404).json({ ok: false });
    return response.json({ ok: true, music: getMusicSnapshot(guild.id) ?? null });
});

app.get("/guild/:guildId/settings", async (request, response) => {
    const guild = selectedGuild(request, request.params.guildId);
    if (!guild) return response.redirect("/");
    const prefix = await getPrefix(guild.id);
    const csrf = dashboardSession(request).csrf!;
    const admins = await dashboardAdmins(guild.id);
    const settings = `<style>
        .settings-list{display:grid;gap:12px}.settings-section{background:linear-gradient(145deg,rgba(27,34,59,.94),rgba(20,25,45,.96));border:1px solid rgba(129,145,211,.18);border-radius:12px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,.12)}.settings-section summary{display:flex;align-items:center;justify-content:space-between;gap:20px;cursor:pointer;list-style:none;padding:22px 24px}.settings-section summary::-webkit-details-marker{display:none}.settings-section summary strong{display:block;font-size:15px}.settings-section summary small{display:block;color:var(--muted);font-size:12px;font-weight:400;margin-top:7px}.settings-section summary>b{color:#bbc6e6;font-size:18px;transition:transform .2s ease}.settings-section[open] summary>b{transform:rotate(180deg)}.settings-body{border-top:1px solid rgba(129,145,211,.14);padding:20px 24px}.admin-list{display:flex;flex-wrap:wrap;gap:9px}.admin-chip{display:inline-flex;align-items:center;gap:8px;background:rgba(17,22,42,.8);border:1px solid rgba(129,145,211,.14);border-radius:9px;padding:7px 10px;font-size:12px}.admin-chip img{width:25px;height:25px;border-radius:50%}.setting-control{display:grid;gap:8px;color:#d9def3;font-size:13px;max-width:430px}.setting-control input,.setting-control select{background:rgba(10,14,29,.76);border:1px solid rgba(129,145,211,.22);border-radius:9px;color:#fff;padding:11px 12px}.setting-control input[type=color]{height:44px;padding:4px;cursor:pointer}.settings-inline-form{display:flex;align-items:end;gap:12px;flex-wrap:wrap}.settings-inline-form .button{height:42px}.settings-body code{background:rgba(105,120,255,.14);border-radius:5px;padding:3px 6px;color:#cad1ff}
    </style>
        <a class="back" href="/guild/${guild.id}">← Modulos</a>
        <div class="title"><div><h1>Ajustes</h1><span class="muted">Configura SaraBot para ${escape(guild.name)}.</span></div></div>
        <div class="settings-list">
            <details class="settings-section" open>
                <summary><span><strong>Gestor del Bot</strong><small>Administra quién puede gestionar SaraBot en este servidor.</small></span><b>⌄</b></summary>
                <div class="settings-body">
                    <p class="muted">Los propietarios y usuarios con permiso de Administrador en Discord pueden acceder al panel.</p>
                    <div class="admin-list">${admins.map(user => `<span class="admin-chip"><img src="${avatarUrl(user, 64)}" alt="">${escape(user.global_name || user.username)}</span>`).join("") || `<span class="muted">No se pudo cargar la lista de administradores.</span>`}</div>
                </div>
            </details>
            <details class="settings-section">
                <summary><span><strong>Idioma</strong><small>Cambia el idioma predeterminado de este panel.</small></span><b>⌄</b></summary>
                <div class="settings-body"><label class="setting-control">Idioma del panel<select id="settings-language"><option value="es">Español</option><option value="en">English</option></select></label><p class="muted">El cambio se guarda para tu sesión de usuario.</p></div>
            </details>
            <details class="settings-section">
                <summary><span><strong>Zona horaria</strong><small>Personaliza cómo se muestran las fechas del panel.</small></span><b>⌄</b></summary>
                <div class="settings-body"><label class="setting-control">Zona horaria<select id="settings-timezone">${Intl.supportedValuesOf("timeZone").map(zone => `<option value="${zone}">${zone}</option>`).join("")}</select></label><p class="muted">Se aplicará a las fechas que se muestren en tu navegador.</p></div>
            </details>
            <details class="settings-section">
                <summary><span><strong>Color predeterminado de embeds</strong><small>Elige el color visual para los embeds de SaraBot.</small></span><b>⌄</b></summary>
                <div class="settings-body"><label class="setting-control">Color del embed<input id="embed-color" type="color" value="#6978ff"></label><p class="muted">La preferencia queda guardada en este navegador.</p></div>
            </details>
            <details class="settings-section" open>
                <summary><span><strong>Prefijo de comandos</strong><small>Define el prefijo para los comandos con texto.</small></span><b>⌄</b></summary>
                <div class="settings-body"><form class="settings-inline-form" method="post" action="/guild/${guild.id}/prefix"><label class="setting-control">Prefijo actual<input name="prefix" maxlength="5" value="${escape(prefix)}" required></label><input type="hidden" name="csrf" value="${csrf}"><button class="button">Guardar cambios</button></form></div>
            </details>
            <details class="settings-section">
                <summary><span><strong>Comandos slash</strong><small>Consulta el estado de los comandos registrados en Discord.</small></span><b>⌄</b></summary>
                <div class="settings-body"><p class="muted">Los comandos slash se registran con el proceso de despliegue del bot. Ejecuta <code>npm run deploy</code> cuando agregues o cambies comandos.</p></div>
            </details>
        </div>
        <script>
            (function(){
                var language=document.getElementById('settings-language');
                var timezone=document.getElementById('settings-timezone');
                var color=document.getElementById('embed-color');
                language.value=localStorage.getItem('sarabot-language')||'es';
                timezone.value=localStorage.getItem('sarabot-timezone')||Intl.DateTimeFormat().resolvedOptions().timeZone;
                color.value=localStorage.getItem('sarabot-embed-color')||'#6978ff';
                language.onchange=function(){localStorage.setItem('sarabot-language',language.value);location.href='/dashboard-language?lang='+language.value+'&return='+encodeURIComponent(location.pathname);};
                timezone.onchange=function(){localStorage.setItem('sarabot-timezone',timezone.value);};
                color.onchange=function(){localStorage.setItem('sarabot-embed-color',color.value);};
            }());
        </script>`;
    response.send(modernView("Ajustes", settings));
});

app.get("/guild/:guildId/moderation/admin", async (request, response) => { const guild = selectedGuild(request, request.params.guildId); if (!guild) return response.redirect("/"); const settings = await prisma.guildModerationSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id }, update: {} }); const csrf = dashboardSession(request).csrf!; response.send(modernView("Administrador", `<a class="back" href="/guild/${guild.id}/commands/moderacion">← Moderacion</a><div class="title"><div><h1>Administrador</h1><span class="muted">Protege roles y excluye canales de la moderacion automatica.</span></div></div><section class="panel"><h2>Roles inmunizados</h2><form class="form" method="post" action="/guild/${guild.id}/moderation/settings"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="returnTo" value="admin"><label class="muted">IDs de roles inmunizados<input name="immuneRoleIds" value="${escape(settings.immuneRoleIds ?? "")}" placeholder="ID de rol, otro ID"></label><label class="muted">IDs de canales ignorados<input name="ignoredChannelIds" value="${escape(settings.ignoredChannelIds ?? "")}" placeholder="ID de canal, otro ID"></label><p class="muted">Los usuarios con roles inmunizados y los canales ignorados no serán evaluados por el AutoMod.</p><button class="button">Guardar administrador</button></form></section>`)); });

app.get("/guild/:guildId/moderation/audit-settings", async (request, response) => { const guild = selectedGuild(request, request.params.guildId); if (!guild) return response.redirect("/"); const settings = await prisma.guildModerationSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id }, update: {} }); const csrf = dashboardSession(request).csrf!; response.send(modernView("Registro de auditoria", `<a class="back" href="/guild/${guild.id}/commands/moderacion">← Moderacion</a><div class="title"><div><h1>Registro de auditoria</h1><span class="muted">Envía las acciones del AutoMod a un canal del servidor.</span></div></div><section class="panel"><form class="form" method="post" action="/guild/${guild.id}/moderation/settings"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="returnTo" value="audit-settings"><label class="muted">ID del canal de registro<input name="auditChannelId" value="${escape(settings.auditChannelId ?? "")}" placeholder="ID del canal"></label><label class="rule"><span>Registrar acciones de AutoMod</span><input class="switch" type="checkbox" name="auditAutoMod" ${settings.auditAutoMod ? "checked" : ""}></label><button class="button">Guardar registro</button></form></section>`)); });

app.post("/guild/:guildId/moderation/settings", async (request, response) => { const guild = selectedGuild(request, request.params.guildId); const data = dashboardSession(request); if (!guild || request.body.csrf !== data.csrf) return response.status(400).send("Solicitud invalida."); const current = await prisma.guildModerationSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id }, update: {} }); const string = (key: string, fallback: string | null) => typeof request.body[key] === "string" ? request.body[key].trim().slice(0, 5000) || null : fallback; await prisma.guildModerationSettings.update({ where: { guildId: guild.id }, data: { immuneRoleIds: string("immuneRoleIds", current.immuneRoleIds), ignoredChannelIds: string("ignoredChannelIds", current.ignoredChannelIds), auditChannelId: string("auditChannelId", current.auditChannelId), auditAutoMod: typeof request.body.auditAutoMod === "undefined" ? current.auditAutoMod : request.body.auditAutoMod === "on" } }); const section = request.body.returnTo === "admin" ? "admin" : "audit-settings"; response.redirect(`/guild/${guild.id}/moderation/${section}`); });

app.get("/guild/:guildId/automod", async (request, response) => {
    const guild = selectedGuild(request, request.params.guildId); if (!guild) return response.redirect("/");
    const settings = await prisma.autoModSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id }, update: {} }); const csrf = dashboardSession(request).csrf!;
    const rules = [["badWords", "Palabras inapropiadas"], ["repeatedText", "Texto repetido"], ["invites", "Invitaciones a servidores"], ["externalLinks", "Enlaces externos"], ["excessiveCaps", "Demasiadas mayusculas"], ["excessiveEmojis", "Demasiados emojis"], ["excessiveSpoilers", "Demasiados spoilers"], ["excessiveMentions", "Demasiadas menciones"], ["zalgo", "Zalgo"], ["antiSpam", "Anti-spam"]] as const;
    response.send(modernView("Moderacion", `<a class="back" href="/guild/${guild.id}">← Modulos</a><div class="title"><div><h1>Moderacion</h1><span class="muted">Mantén tu servidor seguro con moderación automática y herramientas para moderadores.</span></div></div><section class="panel"><h2>Reglas del AutoMod <input class="switch" form="automod" type="checkbox" name="enabled" ${settings.enabled ? "checked" : ""}></h2><p class="muted">Los mensajes que incumplen una regla activa se eliminan y quedan registrados.</p><form class="form" id="automod" method="post" action="/guild/${guild.id}/automod"><input type="hidden" name="csrf" value="${csrf}"><label class="muted">Palabras bloqueadas (separadas por comas o líneas)<input name="blockedWords" value="${escape(settings.blockedWords ?? "")}" placeholder="palabra1, palabra2"></label><div class="cards">${rules.map(([field, label]) => `<label class="rule"><span>${label}</span><input class="switch" type="checkbox" name="${field}" ${settings[field] ? "checked" : ""}></label>`).join("")}</div><button class="button">Guardar reglas</button></form></section><section class="panel"><h2>Administrador</h2><p class="muted">Usa los comandos /ban, /unban, /kick, /warn, /timeout, /untimeout, /clear, /lock, /unlock y /slowmode.</p><a class="button" href="/guild/${guild.id}/moderation/audit">Ver registro de auditoria</a></section>`));
});

app.get("/guild/:guildId/moderation/audit", async (request, response) => { const guild = selectedGuild(request, request.params.guildId); if (!guild) return response.redirect("/"); const logs = await prisma.moderationLog.findMany({ where: { guildId: guild.id }, orderBy: { createdAt: "desc" }, take: 100 }); response.send(modernView("Registro de auditoria", `<a class="back" href="/guild/${guild.id}/commands/moderacion">← Moderacion</a><div class="title"><div><h1>Registro de auditoria</h1><span class="muted">Acciones automáticas recientes del AutoMod.</span></div></div><section class="panel">${logs.map(log => `<div class="rule"><span><strong>${escape(log.rule)}</strong><br><small class="muted">Usuario: ${log.userId} · ${escape(log.content ?? "")}</small></span><small class="muted">${log.createdAt.toLocaleString("es-CO")}</small></div>`).join("") || `<p class="muted">Aun no hay acciones registradas.</p>`}</section>`)); });

app.post("/guild/:guildId/automod", async (request, response) => { const guild = selectedGuild(request, request.params.guildId); const data = dashboardSession(request); if (!guild || request.body.csrf !== data.csrf) return response.status(400).send("Solicitud invalida."); const fields = ["enabled", "badWords", "repeatedText", "invites", "externalLinks", "excessiveCaps", "excessiveEmojis", "excessiveSpoilers", "excessiveMentions", "zalgo", "antiSpam"] as const; const values = Object.fromEntries(fields.map(field => [field, request.body[field] === "on"])); const blockedWords = typeof request.body.blockedWords === "string" ? request.body.blockedWords.trim().slice(0, 5000) : ""; await prisma.autoModSettings.upsert({ where: { guildId: guild.id }, create: { guildId: guild.id, ...values, blockedWords: blockedWords || null }, update: { ...values, blockedWords: blockedWords || null } }); return response.redirect(`/guild/${guild.id}/commands/moderacion`); });

app.get("/guild/:guildId/commands/:category", async (request, response) => {
    const guild = selectedGuild(request, request.params.guildId); const category = request.params.category;
    if (!guild || (category !== "economia" && category !== "moderacion")) return response.redirect("/");
    const settings = await prisma.guildCommandSetting.findMany({ where: { guildId: guild.id } }); const disabled = new Set(settings.filter(item => !item.enabled).map(item => item.commandName)); const csrf = dashboardSession(request).csrf!;
    const title = category === "economia" ? "Economia" : "Moderacion";
    response.send(modernView(title, `<a class="back" href="/guild/${guild.id}">← Modulos</a><div class="title"><div><h1>${title}</h1><span class="muted">Activa o desactiva comandos sin recargar la pagina.</span></div></div><section class="panel">${commandRows(guild.id, category, disabled, csrf)}</section><script>document.querySelectorAll('.switch').forEach(s=>s.addEventListener('change',async e=>{const el=e.currentTarget;el.disabled=true;try{const r=await fetch('/api/guild/${guild.id}/command/'+el.dataset.command,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:'${csrf}',enabled:String(el.checked)})});if(!r.ok)throw Error();}catch{el.checked=!el.checked;alert('No se pudo guardar el cambio.');}finally{el.disabled=false;}}));</script>`));
});

app.get("/guild/:guildId/levels", async (request, response) => { const guild = selectedGuild(request, request.params.guildId); if (!guild) return response.redirect("/"); const leaders = await prisma.userLevel.findMany({ where: { guildId: guild.id }, orderBy: [{ level: "desc" }, { xp: "desc" }], take: 10 }); response.send(modernView("Niveles", `<a class="back" href="/guild/${guild.id}">← Modulos</a><div class="title"><div><h1>🏆 Niveles</h1><span class="muted">Cada usuario recibe 15–25 XP por mensaje, como maximo una vez por minuto.</span></div></div><section class="panel"><h2>Ranking de niveles</h2>${leaders.map((row, i) => `<div class="rule"><span>#${i + 1} · <@${row.userId}></span><strong>Nivel ${row.level} · ${row.xp} XP</strong></div>`).join("") || `<p class="muted">Aun no hay actividad. El comando /rank permite a cada usuario ver su progreso.</p>`}</section>`)); });

app.get("/guild/:guildId/reaction-roles", async (request, response) => { const guild = selectedGuild(request, request.params.guildId); if (!guild) return response.redirect("/"); const rules = await prisma.reactionRole.findMany({ where: { guildId: guild.id }, orderBy: { createdAt: "desc" } }); const csrf = dashboardSession(request).csrf!; response.send(modernView("Reaction Roles", `<a class="back" href="/guild/${guild.id}">← Modulos</a><div class="title"><div><h1>🎭 Reaction Roles</h1><span class="muted">Al reaccionar, el bot entrega el rol elegido.</span></div></div><section class="panel"><h2>Nueva regla</h2><form class="form" method="post" action="/guild/${guild.id}/reaction-roles"><input name="channelId" placeholder="ID del canal" required><input name="messageId" placeholder="ID del mensaje" required><input name="roleId" placeholder="ID del rol" required><input name="emoji" placeholder="Emoji, por ejemplo ✅" required><input type="hidden" name="csrf" value="${csrf}"><button class="button">Crear reaction role</button></form><p class="muted">Activa el modo desarrollador de Discord para copiar IDs. El bot necesita Gestionar roles y su rol debe estar por encima del rol que va a asignar.</p></section><section class="panel"><h2>Reglas activas</h2>${rules.map(rule => `<div class="rule"><span>${escape(rule.emoji)} → <@&${rule.roleId}></span><small class="muted">Mensaje ${rule.messageId}</small></div>`).join("") || `<p class="muted">Todavia no has creado reglas.</p>`}</section>`)); });

app.post("/api/guild/:guildId/command/:command", async (request, response) => { const guild = selectedGuild(request, request.params.guildId); const data = dashboardSession(request); const name = request.params.command; if (!guild || request.body.csrf !== data.csrf || !commands.some(command => command[0] === name)) return response.status(400).json({ ok: false }); const enabled = request.body.enabled === "true"; await prisma.guildCommandSetting.upsert({ where: { guildId_commandName: { guildId: guild.id, commandName: name } }, create: { guildId: guild.id, commandName: name, enabled }, update: { enabled } }); return response.json({ ok: true, enabled }); });

app.post("/guild/:guildId/reaction-roles", async (request, response) => { const guild = selectedGuild(request, request.params.guildId); const data = dashboardSession(request); const fields = ["channelId", "messageId", "roleId", "emoji"] as const; if (!guild || request.body.csrf !== data.csrf || fields.some(field => typeof request.body[field] !== "string" || !request.body[field].trim())) return response.status(400).send("Solicitud invalida."); const channelId = request.body.channelId.trim(); const messageId = request.body.messageId.trim(); const roleId = request.body.roleId.trim(); const emoji = request.body.emoji.trim(); const reacted = await discordPut(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`); if (!reacted) return response.status(400).send("No se pudo reaccionar al mensaje. Revisa los IDs, el emoji y los permisos del bot."); await prisma.reactionRole.create({ data: { guildId: guild.id, channelId, messageId, roleId, emoji } }); return response.redirect(`/guild/${guild.id}/reaction-roles`); });

app.post("/guild/:guildId/prefix", async (request, response) => {
    const guild = selectedGuild(request, request.params.guildId); const data = dashboardSession(request); const prefix = typeof request.body.prefix === "string" ? request.body.prefix.trim() : "";
    if (!guild || request.body.csrf !== data.csrf || !prefix || prefix.length > 5) return response.status(400).send("Solicitud inválida.");
    await setPrefix(guild.id, prefix); return response.redirect(`/guild/${guild.id}`);
});

app.post("/guild/:guildId/command/:command", async (request, response) => {
    const guild = selectedGuild(request, request.params.guildId); const data = dashboardSession(request); const name = request.params.command;
    if (!guild || request.body.csrf !== data.csrf || !commands.some(command => command[0] === name)) return response.status(400).send("Solicitud inválida.");
    const enabled = request.body.enabled === "true";
    await prisma.guildCommandSetting.upsert({ where: { guildId_commandName: { guildId: guild.id, commandName: name } }, create: { guildId: guild.id, commandName: name, enabled }, update: { enabled } });
    return response.redirect(`/guild/${guild.id}`);
});

app.get("/logout", (request, response) => request.session.destroy(() => response.redirect("/")));

app.listen(port, "0.0.0.0", () => console.log(`Panel web disponible en el puerto ${port}`));