import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada.");
}

const databaseUrl = new URL(connectionString);

if (databaseUrl.protocol !== "mysql:") {
    throw new Error("DATABASE_URL debe usar el protocolo mysql://.");
}

const database = databaseUrl.pathname.slice(1);

if (!database) {
    throw new Error("DATABASE_URL debe incluir el nombre de la base de datos.");
}

const adapter = new PrismaMariaDb({
    host: databaseUrl.hostname,
    port: databaseUrl.port ? Number(databaseUrl.port) : 3306,
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: decodeURIComponent(database),
});

export const prisma = new PrismaClient({ adapter });
