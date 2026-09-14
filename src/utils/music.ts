import {
    AudioPlayerStatus,
    StreamType,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    entersState,
    joinVoiceChannel,
    type AudioPlayer,
    type AudioResource,
    type VoiceConnection,
} from "@discordjs/voice";
import { PermissionFlagsBits, type GuildMember } from "discord.js";
import play from "play-dl";
import ytSearch from "yt-search";
import ytdl from "youtube-dl-exec";

export type MusicAction =
    | "play" | "radio" | "skip" | "stop" | "pause" | "resume" | "queue" | "search"
    | "nowplaying" | "shuffle" | "volume" | "clear" | "remove" | "previous" | "disconnect"
    | "loop" | "jump" | "seek" | "forward" | "rewind" | "join" | "lyrics" | "history"
    | "autoplay" | "debug" | "dj" | "announce" | "247" | "restrict" | "move"
    | "playlist";

export type LoopMode = "off" | "song" | "queue";
export type Track = {
    title: string;
    url: string;
    requestedBy: string;
    duration?: number;
    thumbnail?: string;
    source?: "youtube" | "radio" | "playlist";
};

type MusicTextChannel = {
    send(content: string): Promise<unknown>;
    id?: string;
};

type GuildQueue = {
    connection: VoiceConnection;
    player: AudioPlayer;
    tracks: Track[];
    current: Track | undefined;
    history: Track[];
    textChannel: MusicTextChannel;
    sourceProcess: ReturnType<typeof ytdl.exec> | undefined;
    resource: AudioResource<Track> | undefined;
    volume: number;
    loop: LoopMode;
    autoplay: boolean;
    djMode: boolean;
    announceChannelId: string | undefined;
    alwaysOn: boolean;
    restrictedVoiceChannelId: string | undefined;
    position: number;
    startedAt: number | undefined;
    playlists: Map<string, Track[]>;
};

export type MusicSnapshot = {
    guildId: string;
    connected: boolean;
    voiceChannelId: string | undefined;
    current: Track | undefined;
    tracks: Track[];
    history: Track[];
    volume: number;
    loop: LoopMode;
    autoplay: boolean;
    djMode: boolean;
    announceChannelId: string | undefined;
    alwaysOn: boolean;
    restrictedVoiceChannelId: string | undefined;
    position: number;
};

const queues = new Map<string, GuildQueue>();

function textSend(channel: MusicTextChannel, content: string) {
    return channel.send(content).catch(() => undefined);
}

async function spotifySearch(query: string) {
    const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error("No se pudo consultar Spotify.");
    const metadata = await response.json() as { title?: string; author_name?: string };
    if (!metadata.title) throw new Error("No se pudo obtener la canción de Spotify.");
    return `${metadata.title}${metadata.author_name ? ` ${metadata.author_name}` : ""}`;
}

function trackDuration(track: unknown) {
    if (!track || typeof track !== "object") return undefined;
    const data = track as { duration?: unknown; seconds?: unknown };
    if (typeof data.seconds === "number" && data.seconds > 0) return data.seconds;
    if (typeof data.duration === "number" && data.duration > 0) return data.duration;
    if (data.duration && typeof data.duration === "object") {
        const seconds = (data.duration as { seconds?: unknown }).seconds;
        if (typeof seconds === "number" && seconds > 0) return seconds;
    }
    return undefined;
}

async function resolveTrack(query: string, requestedBy: string, source: Track["source"] = "youtube"): Promise<Track> {
    const spotify = /open\.spotify\.com\/(?:intl-[^/]+\/)?track\//.test(query);
    const searchQuery = spotify ? await spotifySearch(query) : query;
    const isYouTube = play.yt_validate(searchQuery) === "video";
    const track = isYouTube
        ? (() => {
            return play.video_basic_info(searchQuery).then(details => ({ url: searchQuery, title: details.video_details.title, duration: details.video_details.durationInSec, thumbnail: details.video_details.thumbnails.at(-1)?.url }));
        })()
        : (await ytSearch(searchQuery)).videos[0];
    const resolvedTrack = await track;
    if (!resolvedTrack?.url) throw new Error("No encontré esa canción en YouTube.");
    const videoId = resolvedTrack.url.match(/[?&]v=([^&]+)/)?.[1];
    const thumbnail = "thumbnail" in resolvedTrack ? resolvedTrack.thumbnail : videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined;
    const duration = trackDuration(resolvedTrack);
    return { title: resolvedTrack.title ?? "Sin título", url: resolvedTrack.url, requestedBy, ...(thumbnail ? { thumbnail } : {}), ...(duration ? { duration } : {}), source };
}

function getQueue(guildId: string) {
    const queue = queues.get(guildId);
    if (!queue) throw new Error("No hay una sesión de música activa.");
    return queue;
}

async function createQueue(guildId: string, member: GuildMember, channel: MusicTextChannel) {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) throw new Error("Debes estar en un canal de voz.");
    const botMember = voiceChannel.guild.members.me;
    const permissions = botMember ? voiceChannel.permissionsFor(botMember) : null;
    if (!permissions?.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak)) {
        throw new Error("Necesito los permisos Conectar y Hablar en ese canal de voz.");
    }
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    const player = createAudioPlayer();
    const queue: GuildQueue = {
        connection, player, tracks: [], current: undefined, history: [], textChannel: channel,
        sourceProcess: undefined, resource: undefined, volume: 100, loop: "off", autoplay: false,
        djMode: false, announceChannelId: channel.id, alwaysOn: false,
        restrictedVoiceChannelId: undefined, position: 0, startedAt: undefined, playlists: new Map(),
    };
    connection.subscribe(player);
    queues.set(guildId, queue);
    setupPlayer(guildId, queue);
    return queue;
}

async function playNext(guildId: string) {
    const queue = queues.get(guildId);
    if (!queue) return;
    // This is also reached after `skip`; stop the previous downloader before
    // starting (or disconnecting from) the next track.
    const previousSource = queue.sourceProcess;
    queue.sourceProcess = undefined;
    previousSource?.kill();
    if (queue.loop === "queue" && queue.current) queue.tracks.push(queue.current);
    let next = queue.tracks.shift();
    if (!next && queue.loop === "song" && queue.current) next = queue.current;
    if (!next && queue.autoplay && queue.current && queue.current.source !== "radio") {
        try {
            next = await resolveTrack(`${queue.current.title} mix`, queue.current.requestedBy);
        } catch {
            next = undefined;
        }
    }
    if (!next) {
        queue.current = undefined;
        queue.resource = undefined;
        if (!queue.alwaysOn) {
            queue.connection.destroy();
            queues.delete(guildId);
        }
        return;
    }

    if (queue.current && queue.current.url !== next.url) queue.history.push(queue.current);
    queue.history = queue.history.slice(-50);
    queue.current = next;
    queue.position = 0;
    queue.startedAt = Date.now();
    const sourceProcess = ytdl.exec(next.url, {
        format: "bestaudio[ext=webm][acodec=opus]/bestaudio[ext=webm]/bestaudio",
        output: "-",
        quiet: true,
        noWarnings: true,
    });
    queue.sourceProcess = sourceProcess;
    void sourceProcess.catch(error => {
        if (queue.sourceProcess === sourceProcess) console.error("yt-dlp process error:", error);
    });
    sourceProcess.on("error", error => console.error("yt-dlp process error:", error));
    sourceProcess.stderr?.on("data", data => console.error("yt-dlp:", data.toString().trim()));
    if (!sourceProcess.stdout) throw new Error("No se pudo abrir el audio.");
    const resource = createAudioResource<Track>(sourceProcess.stdout, {
        inputType: StreamType.WebmOpus,
        metadata: next,
        inlineVolume: true,
    });
    resource.volume?.setVolume(queue.volume / 100);
    queue.resource = resource;
    queue.player.play(resource);
    await textSend(queue.textChannel, `▶️ Reproduciendo **${next.title}**`);
}

function setupPlayer(guildId: string, queue: GuildQueue) {
    queue.player.on(AudioPlayerStatus.Idle, () => void playNext(guildId).catch(error => console.error("Music playback error:", error)));
    queue.player.on("error", error => {
        console.error("Music player error:", error);
        void textSend(queue.textChannel, "❌ No se pudo reproducir esa canción.");
        void playNext(guildId).catch(nextError => console.error("Music queue error:", nextError));
    });
}

function requireMemberVoice(queue: GuildQueue, member: GuildMember) {
    const channelId = member.voice.channel?.id;
    if (!channelId) throw new Error("Debes estar en un canal de voz.");
    if (queue.restrictedVoiceChannelId && queue.restrictedVoiceChannelId !== channelId) {
        throw new Error("La música está restringida a otro canal de voz.");
    }
    if (queue.connection.joinConfig.channelId !== channelId) throw new Error("Debes estar en mi canal de voz.");
}

function formatQueue(queue: GuildQueue) {
    const upcoming = queue.tracks.slice(0, 15).map((track, index) => `${index + 1}. ${track.title}`).join("\n");
    return `🎶 **Cola actual**\n${queue.current ? `▶️ ${queue.current.title}\n` : ""}${upcoming || "No hay canciones en espera."}`;
}

function snapshotFromQueue(queue: GuildQueue): Omit<MusicSnapshot, "guildId"> {
    return {
        connected: queue.connection.state.status !== VoiceConnectionStatus.Destroyed,
        voiceChannelId: queue.connection.joinConfig.channelId ?? undefined,
        current: queue.current,
        tracks: [...queue.tracks],
        history: [...queue.history],
        volume: queue.volume,
        loop: queue.loop,
        autoplay: queue.autoplay,
        djMode: queue.djMode,
        announceChannelId: queue.announceChannelId,
        alwaysOn: queue.alwaysOn,
        restrictedVoiceChannelId: queue.restrictedVoiceChannelId,
        position: queue.startedAt ? Math.floor((Date.now() - queue.startedAt) / 1000) : queue.position,
    };
}

export function getMusicSnapshot(guildId: string): MusicSnapshot | undefined {
    const queue = queues.get(guildId);
    if (!queue) return undefined;
    return { ...snapshotFromQueue(queue), guildId };
}

export function getMusicSnapshots() {
    return [...queues.keys()].map(getMusicSnapshot).filter((snapshot): snapshot is MusicSnapshot => Boolean(snapshot));
}

export async function executeMusic(
    guildId: string,
    member: GuildMember,
    channel: MusicTextChannel,
    action: MusicAction,
    query?: string,
) {
    if (action === "play" || action === "radio") {
        if (!query?.trim()) throw new Error("Indica una canción, búsqueda o enlace.");
        let queue = queues.get(guildId);
        if (!queue) queue = await createQueue(guildId, member, channel);
        else {
            requireMemberVoice(queue, member);
            queue.textChannel = channel;
        }
        const track = action === "radio"
            ? { title: "Radio en directo", url: query.trim(), requestedBy: member.displayName, source: "radio" as const }
            : await resolveTrack(query.trim(), member.displayName);
        const wasIdle = !queue.current;
        queue.tracks.push(track);
        if (wasIdle) await playNext(guildId);
        else await textSend(channel, `➕ Añadido a la cola: **${track.title}**`);
        return `✅ ${wasIdle ? "Reproduciendo" : "Añadido"}: **${track.title}**`;
    }

    if (action === "join") {
        if (!queues.has(guildId)) await createQueue(guildId, member, channel);
        else requireMemberVoice(getQueue(guildId), member);
        return "🔊 Conectado al canal de voz.";
    }

    if (action === "search") {
        if (!query?.trim()) throw new Error("Indica una búsqueda.");
        const results = (await ytSearch(query)).videos.slice(0, 5);
        return results.length ? results.map((track, index) => `${index + 1}. **${track.title}** — ${track.url}`).join("\n") : "No encontré resultados.";
    }

    const queue = getQueue(guildId);
    requireMemberVoice(queue, member);
    if (action === "skip") {
        // The Idle listener advances the queue and safely replaces the stream.
        // Destroying stdout here emits a second player error and used to take down Node.
        queue.player.stop(true);
        return "⏭️ Canción omitida.";
    }
    if (action === "stop") {
        queue.tracks.length = 0; queue.sourceProcess?.kill(); queue.player.stop(); queue.connection.destroy(); queues.delete(guildId);
        return "⏹️ Música detenida y cola vaciada.";
    }
    if (action === "disconnect") {
        queue.tracks.length = 0; queue.sourceProcess?.kill(); queue.player.stop(); queue.connection.destroy(); queues.delete(guildId);
        return "👋 Desconectado del canal de voz.";
    }
    if (action === "pause") { if (!queue.player.pause()) throw new Error("La música ya está pausada."); return "⏸️ Música pausada."; }
    if (action === "resume") { if (!queue.player.unpause()) throw new Error("La música ya está reproduciéndose."); return "▶️ Música reanudada."; }
    if (action === "queue") return formatQueue(queue);
    if (action === "nowplaying") return queue.current ? `🎵 **${queue.current.title}** · Volumen ${queue.volume}% · Loop ${queue.loop}` : "No hay canción actual.";
    if (action === "history") return queue.history.length ? `🕘 **Historial**\n${queue.history.slice(-15).reverse().map((track, i) => `${i + 1}. ${track.title}`).join("\n")}` : "El historial está vacío.";
    if (action === "shuffle") { for (let i = queue.tracks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j]!, queue.tracks[i]!]; } return "🔀 Cola mezclada."; }
    if (action === "clear") { queue.tracks.length = 0; return "🧹 Cola vaciada (la canción actual continúa)."; }
    if (action === "remove") { const index = Number(query) - 1; if (!Number.isInteger(index) || index < 0 || index >= queue.tracks.length) throw new Error("Indica una posición válida de la cola."); queue.tracks.splice(index, 1); return `🗑️ Canción ${index + 1} eliminada.`; }
    if (action === "jump") { const index = Number(query) - 1; if (!Number.isInteger(index) || index < 0 || index >= queue.tracks.length) throw new Error("Indica una posición válida de la cola."); const [track] = queue.tracks.splice(index, 1); if (queue.current) queue.tracks.unshift(queue.current); queue.current = undefined; queue.player.stop(); queue.tracks.unshift(track!); return "⏩ Saltando a la posición indicada."; }
    if (action === "previous") { const previous = queue.history.pop(); if (!previous) throw new Error("No hay canción anterior."); if (queue.current) queue.tracks.unshift(queue.current); queue.current = undefined; queue.tracks.unshift(previous); queue.player.stop(); return "⏮️ Reproduciendo la canción anterior."; }
    if (action === "volume") { const value = Number(query); if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("El volumen debe estar entre 0 y 100."); queue.volume = Math.round(value); queue.resource?.volume?.setVolume(queue.volume / 100); return `🔊 Volumen: ${queue.volume}%.`; }
    if (action === "loop") { const mode = query === "song" || query === "queue" ? query : "off"; queue.loop = mode; return `🔁 Loop: ${mode}.`; }
    if (action === "autoplay") { queue.autoplay = query !== "off" && !["false", "0"].includes((query ?? "").toLowerCase()); return `♾️ Autoplay: ${queue.autoplay ? "activado" : "desactivado"}.`; }
    if (action === "dj") { queue.djMode = query !== "off" && query !== "false"; return `🛡️ Modo DJ: ${queue.djMode ? "activado" : "desactivado"}.`; }
    if (action === "announce") { queue.announceChannelId = query?.trim() || channel.id; return `📣 Canal de anuncios: ${queue.announceChannelId ?? "actual"}.`; }
    if (action === "247") { queue.alwaysOn = query !== "off" && query !== "false"; return `♾️ 24/7: ${queue.alwaysOn ? "activado" : "desactivado"}.`; }
    if (action === "restrict") { queue.restrictedVoiceChannelId = query?.trim() || member.voice.channel?.id; return `🔒 Canal de voz restringido: ${queue.restrictedVoiceChannelId}.`; }
    if (action === "move") {
        const voiceChannel = member.voice.channel;
        if (!voiceChannel) throw new Error("Debes estar en el canal de voz de destino.");
        const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId, adapterCreator: voiceChannel.guild.voiceAdapterCreator, selfDeaf: true });
        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
        queue.connection.destroy(); queue.connection = connection; connection.subscribe(queue.player);
        return `🔊 Me moví a **${voiceChannel.name}**.`;
    }
    if (action === "lyrics") {
        if (!queue.current) throw new Error("No hay canción actual.");
        const [artist, ...titleParts] = queue.current.title.split(" - ");
        const title = titleParts.join(" - ") || queue.current.title;
        const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(titleParts.length ? artist! : "")}&track_name=${encodeURIComponent(title)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("No hay letras disponibles para esta canción.");
        const data = await response.json() as { plainLyrics?: string | null };
        if (!data.plainLyrics) throw new Error("No hay letras disponibles para esta canción.");
        return `📜 **${queue.current.title}**\n${data.plainLyrics.slice(0, 1900)}`;
    }
    if (action === "debug") return `🧪 Estado: ${queue.player.state.status}; conexión: ${queue.connection.state.status}; cola: ${queue.tracks.length}; proceso: ${queue.sourceProcess ? "activo" : "inactivo"}.`;
    if (action === "seek" || action === "forward" || action === "rewind") throw new Error("El desplazamiento requiere una fuente descargable con duración; no está disponible para esta transmisión.");
    if (action === "playlist") {
        const [name, ...rest] = (query ?? "").trim().split(/\s+/);
        if (!name) throw new Error("Usa playlist <crear|añadir|cargar|ver|borrar> <nombre> [canción].");
        const subcommand = name.toLowerCase();
        const playlistName = rest.shift()?.toLowerCase();
        if (!playlistName) throw new Error("Indica el nombre de la playlist.");
        if (subcommand === "crear") { if (queue.playlists.has(playlistName)) throw new Error("Esa playlist ya existe."); queue.playlists.set(playlistName, []); return `📁 Playlist **${playlistName}** creada.`; }
        if (subcommand === "borrar") { queue.playlists.delete(playlistName); return `🗑️ Playlist **${playlistName}** borrada.`; }
        if (subcommand === "ver") return `📁 **${playlistName}**\n${(queue.playlists.get(playlistName) ?? []).map((track, i) => `${i + 1}. ${track.title}`).join("\n") || "Vacía."}`;
        if (subcommand === "añadir" || subcommand === "agregar") { const playlist = queue.playlists.get(playlistName); if (!playlist) throw new Error("Esa playlist no existe."); const track = await resolveTrack(rest.join(" "), member.displayName, "playlist"); playlist.push(track); return `➕ Añadido a **${playlistName}**: ${track.title}`; }
        if (subcommand === "cargar") { const playlist = queue.playlists.get(playlistName); if (!playlist?.length) throw new Error("Esa playlist no existe o está vacía."); queue.tracks.push(...playlist); return `▶️ Cargadas ${playlist.length} canciones.`; }
        throw new Error("Subcomando de playlist no reconocido.");
    }
    return "Acción de música no reconocida.";
}
