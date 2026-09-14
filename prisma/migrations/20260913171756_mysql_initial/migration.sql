-- CreateTable
CREATE TABLE `UserEconomy` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `guildId` VARCHAR(191) NOT NULL,
    `cash` DOUBLE NOT NULL DEFAULT 0,
    `bank` DOUBLE NOT NULL DEFAULT 0,

    UNIQUE INDEX `UserEconomy_userId_key`(`userId`),
    INDEX `UserEconomy_userId_guildId_idx`(`userId`, `guildId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuildSettings` (
    `guildId` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(5) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`guildId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
