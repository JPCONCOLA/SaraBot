CREATE TABLE `GuildModerationSettings` (
    `guildId` VARCHAR(191) NOT NULL,
    `immuneRoleIds` TEXT NULL,
    `ignoredChannelIds` TEXT NULL,
    `auditChannelId` VARCHAR(191) NULL,
    `auditAutoMod` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`guildId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
