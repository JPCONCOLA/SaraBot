CREATE TABLE `AutoModSettings` (
    `guildId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `badWords` BOOLEAN NOT NULL DEFAULT false,
    `repeatedText` BOOLEAN NOT NULL DEFAULT false,
    `invites` BOOLEAN NOT NULL DEFAULT false,
    `externalLinks` BOOLEAN NOT NULL DEFAULT false,
    `excessiveCaps` BOOLEAN NOT NULL DEFAULT false,
    `excessiveEmojis` BOOLEAN NOT NULL DEFAULT false,
    `excessiveSpoilers` BOOLEAN NOT NULL DEFAULT false,
    `excessiveMentions` BOOLEAN NOT NULL DEFAULT false,
    `zalgo` BOOLEAN NOT NULL DEFAULT false,
    `antiSpam` BOOLEAN NOT NULL DEFAULT false,
    `blockedWords` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`guildId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ModerationLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `rule` VARCHAR(64) NOT NULL,
    `content` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `ModerationLog_guildId_createdAt_idx`(`guildId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
