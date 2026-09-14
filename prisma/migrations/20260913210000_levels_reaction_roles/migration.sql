CREATE TABLE `UserLevel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `xp` INTEGER NOT NULL DEFAULT 0,
    `level` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `UserLevel_guildId_userId_key`(`guildId`, `userId`),
    INDEX `UserLevel_guildId_xp_idx`(`guildId`, `xp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ReactionRole` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `channelId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(128) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `ReactionRole_messageId_roleId_emoji_key`(`messageId`, `roleId`, `emoji`),
    INDEX `ReactionRole_guildId_idx`(`guildId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
