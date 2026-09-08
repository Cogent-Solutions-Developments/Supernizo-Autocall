-- AlterTable
ALTER TABLE `PageView`
    ADD COLUMN `anonymousPageViewId` VARCHAR(191) NULL,
    ADD COLUMN `maxScrollPercent` INTEGER NOT NULL DEFAULT 0,
    MODIFY `activeDurationSeconds` INTEGER NOT NULL DEFAULT 0;

UPDATE `PageView`
SET `anonymousPageViewId` = CONCAT('legacy_', `id`)
WHERE `anonymousPageViewId` IS NULL;

ALTER TABLE `PageView`
    MODIFY `anonymousPageViewId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Session`
    ADD COLUMN `activeDurationSeconds` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX `PageView_anonymousPageViewId_key` ON `PageView`(`anonymousPageViewId`);
