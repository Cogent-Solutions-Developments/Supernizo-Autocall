-- AlterTable
ALTER TABLE `Site` ADD COLUMN `audioCallEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `chatEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `consentMode` VARCHAR(32) NULL,
    ADD COLUMN `eventRetentionDays` INTEGER NULL,
    ADD COLUMN `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `trackingEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `videoCallEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `widgetAvatarUrl` VARCHAR(2048) NULL,
    ADD COLUMN `widgetDisplayName` VARCHAR(191) NULL,
    ADD COLUMN `widgetLogoUrl` VARCHAR(2048) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `passwordHash` VARCHAR(255) NULL;
