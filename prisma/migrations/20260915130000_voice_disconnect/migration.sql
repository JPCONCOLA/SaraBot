CREATE TABLE `VoiceDisconnect` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `executeAt` DATETIME(3) NOT NULL,
    `lockedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `VoiceDisconnect_guildId_userId_key`(`guildId`, `userId`),
    INDEX `VoiceDisconnect_executeAt_idx`(`executeAt`),
    INDEX `VoiceDisconnect_guildId_userId_idx`(`guildId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
