import { Message, User } from "discord.js";

export async function resolveUserFromArgs(message: Message, args: string[]): Promise<User | null> {
    const mencion = message.mentions.users.first();
    if (mencion) return mencion;

    const id = args[0];
    if (!id) return null;

    return message.client.users.fetch(id).catch(() => null);
}
