-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(30) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `globalRole` ENUM('ADMIN', 'AGENT', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Site` (
    `id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `publicKey` VARCHAR(191) NOT NULL,
    `allowedOrigins` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `Site_publicKey_key`(`publicKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SiteMember` (
    `id` VARCHAR(30) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `role` ENUM('ADMIN', 'AGENT', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `SiteMember_userId_siteId_idx`(`userId`, `siteId`),
    UNIQUE INDEX `SiteMember_siteId_userId_key`(`siteId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Visitor` (
    `id` VARCHAR(30) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `anonymousId` VARCHAR(191) NOT NULL,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    INDEX `Visitor_siteId_lastSeenAt_idx`(`siteId`, `lastSeenAt`),
    UNIQUE INDEX `Visitor_siteId_anonymousId_key`(`siteId`, `anonymousId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VisitorIdentity` (
    `id` VARCHAR(30) NOT NULL,
    `visitorId` VARCHAR(30) NOT NULL,
    `provider` VARCHAR(64) NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `linkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `VisitorIdentity_provider_externalId_idx`(`provider`, `externalId`),
    UNIQUE INDEX `VisitorIdentity_visitorId_provider_externalId_key`(`visitorId`, `provider`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(30) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `visitorId` VARCHAR(30) NOT NULL,
    `anonymousSessionId` VARCHAR(191) NOT NULL,
    `currentUrl` VARCHAR(2048) NULL,
    `referrerUrl` VARCHAR(2048) NULL,
    `utmSource` VARCHAR(191) NULL,
    `utmMedium` VARCHAR(191) NULL,
    `utmCampaign` VARCHAR(191) NULL,
    `utmTerm` VARCHAR(191) NULL,
    `utmContent` VARCHAR(191) NULL,
    `geoCountry` VARCHAR(2) NULL,
    `geoRegion` VARCHAR(191) NULL,
    `geoCity` VARCHAR(191) NULL,
    `geoTimezone` VARCHAR(64) NULL,
    `deviceType` VARCHAR(32) NULL,
    `browserName` VARCHAR(64) NULL,
    `operatingSystem` VARCHAR(64) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `Session_anonymousSessionId_key`(`anonymousSessionId`),
    INDEX `Session_siteId_lastSeenAt_idx`(`siteId`, `lastSeenAt`),
    INDEX `Session_visitorId_lastSeenAt_idx`(`visitorId`, `lastSeenAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PageView` (
    `id` VARCHAR(30) NOT NULL,
    `sessionId` VARCHAR(30) NOT NULL,
    `path` VARCHAR(2048) NOT NULL,
    `url` VARCHAR(2048) NOT NULL,
    `title` VARCHAR(512) NULL,
    `enteredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,
    `activeDurationSeconds` INTEGER NULL,
    INDEX `PageView_sessionId_enteredAt_idx`(`sessionId`, `enteredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VisitorEvent` (
    `id` VARCHAR(30) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `sessionId` VARCHAR(30) NOT NULL,
    `visitorId` VARCHAR(30) NULL,
    `type` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `VisitorEvent_siteId_type_createdAt_idx`(`siteId`, `type`, `createdAt`),
    INDEX `VisitorEvent_sessionId_createdAt_idx`(`sessionId`, `createdAt`),
    INDEX `VisitorEvent_visitorId_createdAt_idx`(`visitorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatThread` (
    `id` VARCHAR(30) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `visitorId` VARCHAR(30) NOT NULL,
    `sessionId` VARCHAR(30) NULL,
    `assignedAgentId` VARCHAR(30) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `lastMessageAt` DATETIME(3) NULL,
    INDEX `ChatThread_siteId_updatedAt_idx`(`siteId`, `updatedAt`),
    INDEX `ChatThread_visitorId_updatedAt_idx`(`visitorId`, `updatedAt`),
    INDEX `ChatThread_assignedAgentId_updatedAt_idx`(`assignedAgentId`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` VARCHAR(30) NOT NULL,
    `threadId` VARCHAR(30) NOT NULL,
    `senderType` ENUM('VISITOR', 'AGENT', 'SYSTEM') NOT NULL,
    `agentId` VARCHAR(30) NULL,
    `content` TEXT NOT NULL,
    `metadata` JSON NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `ChatMessage_threadId_sentAt_idx`(`threadId`, `sentAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Call` (
    `id` VARCHAR(30) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `visitorId` VARCHAR(30) NOT NULL,
    `sessionId` VARCHAR(30) NULL,
    `agentId` VARCHAR(30) NULL,
    `type` ENUM('AUDIO', 'VIDEO') NOT NULL,
    `status` ENUM('RINGING', 'ACCEPTED', 'REJECTED', 'CONNECTING', 'ACTIVE', 'ENDED', 'MISSED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'RINGING',
    `roomName` VARCHAR(191) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `respondedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `failureCode` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `Call_roomName_key`(`roomName`),
    INDEX `Call_visitorId_requestedAt_idx`(`visitorId`, `requestedAt`),
    INDEX `Call_agentId_requestedAt_idx`(`agentId`, `requestedAt`),
    INDEX `Call_siteId_requestedAt_idx`(`siteId`, `requestedAt`),
    INDEX `Call_sessionId_requestedAt_idx`(`sessionId`, `requestedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CallEvent` (
    `id` VARCHAR(30) NOT NULL,
    `callId` VARCHAR(30) NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `CallEvent_callId_createdAt_idx`(`callId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IntentScoreSnapshot` (
    `id` VARCHAR(30) NOT NULL,
    `siteId` VARCHAR(30) NOT NULL,
    `visitorId` VARCHAR(30) NOT NULL,
    `sessionId` VARCHAR(30) NULL,
    `score` INTEGER NOT NULL,
    `reasons` JSON NULL,
    `capturedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `IntentScoreSnapshot_siteId_capturedAt_idx`(`siteId`, `capturedAt`),
    INDEX `IntentScoreSnapshot_visitorId_capturedAt_idx`(`visitorId`, `capturedAt`),
    INDEX `IntentScoreSnapshot_sessionId_capturedAt_idx`(`sessionId`, `capturedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(30) NOT NULL,
    `siteId` VARCHAR(30) NULL,
    `actorUserId` VARCHAR(30) NULL,
    `action` VARCHAR(128) NOT NULL,
    `entityType` VARCHAR(64) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `AuditLog_siteId_createdAt_idx`(`siteId`, `createdAt`),
    INDEX `AuditLog_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SiteMember` ADD CONSTRAINT `SiteMember_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SiteMember` ADD CONSTRAINT `SiteMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Visitor` ADD CONSTRAINT `Visitor_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `VisitorIdentity` ADD CONSTRAINT `VisitorIdentity_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Session` ADD CONSTRAINT `Session_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Session` ADD CONSTRAINT `Session_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PageView` ADD CONSTRAINT `PageView_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `VisitorEvent` ADD CONSTRAINT `VisitorEvent_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `VisitorEvent` ADD CONSTRAINT `VisitorEvent_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `VisitorEvent` ADD CONSTRAINT `VisitorEvent_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ChatThread` ADD CONSTRAINT `ChatThread_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ChatThread` ADD CONSTRAINT `ChatThread_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ChatThread` ADD CONSTRAINT `ChatThread_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ChatThread` ADD CONSTRAINT `ChatThread_assignedAgentId_fkey` FOREIGN KEY (`assignedAgentId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `ChatThread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Call` ADD CONSTRAINT `Call_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Call` ADD CONSTRAINT `Call_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Call` ADD CONSTRAINT `Call_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Call` ADD CONSTRAINT `Call_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CallEvent` ADD CONSTRAINT `CallEvent_callId_fkey` FOREIGN KEY (`callId`) REFERENCES `Call`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `IntentScoreSnapshot` ADD CONSTRAINT `IntentScoreSnapshot_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `IntentScoreSnapshot` ADD CONSTRAINT `IntentScoreSnapshot_visitorId_fkey` FOREIGN KEY (`visitorId`) REFERENCES `Visitor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `IntentScoreSnapshot` ADD CONSTRAINT `IntentScoreSnapshot_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `Site`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
