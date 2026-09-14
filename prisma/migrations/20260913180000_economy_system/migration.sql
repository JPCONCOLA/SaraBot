-- Make balances independent for each Discord server and store money as whole units.
ALTER TABLE `UserEconomy` DROP INDEX `UserEconomy_userId_key`;
ALTER TABLE `UserEconomy` DROP INDEX `UserEconomy_userId_guildId_idx`;
ALTER TABLE `UserEconomy`
    MODIFY `cash` INTEGER NOT NULL DEFAULT 500,
    MODIFY `bank` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lastDailyAt` DATETIME(3) NULL,
    ADD COLUMN `lastWorkAt` DATETIME(3) NULL,
    ADD COLUMN `lastRobAt` DATETIME(3) NULL,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
CREATE UNIQUE INDEX `UserEconomy_userId_guildId_key` ON `UserEconomy`(`userId`, `guildId`);
CREATE INDEX `UserEconomy_guildId_cash_idx` ON `UserEconomy`(`guildId`, `cash`);
CREATE INDEX `UserEconomy_guildId_bank_idx` ON `UserEconomy`(`guildId`, `bank`);

CREATE TABLE `EconomyTransaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `economyId` INTEGER NOT NULL,
    `type` VARCHAR(32) NOT NULL,
    `amount` INTEGER NOT NULL,
    `balanceCash` INTEGER NOT NULL,
    `balanceBank` INTEGER NOT NULL,
    `metadata` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `EconomyTransaction_economyId_createdAt_idx`(`economyId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `EconomyTransaction_economyId_fkey`
        FOREIGN KEY (`economyId`) REFERENCES `UserEconomy`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
