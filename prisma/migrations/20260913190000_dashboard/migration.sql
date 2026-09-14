CREATE TABLE `GuildCommandSetting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `commandName` VARCHAR(64) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    UNIQUE INDEX `GuildCommandSetting_guildId_commandName_key`(`guildId`, `commandName`),
    INDEX `GuildCommandSetting_guildId_idx`(`guildId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
