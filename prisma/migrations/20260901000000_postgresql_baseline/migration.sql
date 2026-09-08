-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'AGENT', 'VIEWER');

-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ACCEPTED', 'REJECTED', 'CONNECTING', 'ACTIVE', 'ENDED', 'MISSED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChatSenderType" AS ENUM ('VISITOR', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "User" (
    "id" VARCHAR(30) NOT NULL,
    "email" VARCHAR(191) NOT NULL,
    "displayName" VARCHAR(191),
    "passwordHash" VARCHAR(255),
    "globalRole" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(191) NOT NULL,
    "publicKey" VARCHAR(191) NOT NULL,
    "allowedOrigins" JSONB NOT NULL,
    "status" "SiteStatus" NOT NULL DEFAULT 'ACTIVE',
    "widgetDisplayName" VARCHAR(191),
    "widgetAvatarUrl" VARCHAR(2048),
    "widgetLogoUrl" VARCHAR(2048),
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "chatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "audioCallEnabled" BOOLEAN NOT NULL DEFAULT true,
    "videoCallEnabled" BOOLEAN NOT NULL DEFAULT true,
    "consentMode" VARCHAR(32),
    "eventRetentionDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteMember" (
    "id" VARCHAR(30) NOT NULL,
    "siteId" VARCHAR(30) NOT NULL,
    "userId" VARCHAR(30) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitor" (
    "id" VARCHAR(30) NOT NULL,
    "siteId" VARCHAR(30) NOT NULL,
    "anonymousId" VARCHAR(191) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorIdentity" (
    "id" VARCHAR(30) NOT NULL,
    "visitorId" VARCHAR(30) NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "externalId" VARCHAR(191) NOT NULL,
    "displayName" VARCHAR(191),
    "email" VARCHAR(191),
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" VARCHAR(30) NOT NULL,
    "siteId" VARCHAR(30) NOT NULL,
    "visitorId" VARCHAR(30) NOT NULL,
    "anonymousSessionId" VARCHAR(191) NOT NULL,
    "currentUrl" VARCHAR(2048),
    "referrerUrl" VARCHAR(2048),
    "utmSource" VARCHAR(191),
    "utmMedium" VARCHAR(191),
    "utmCampaign" VARCHAR(191),
    "utmTerm" VARCHAR(191),
    "utmContent" VARCHAR(191),
    "geoCountry" VARCHAR(2),
    "geoRegion" VARCHAR(191),
    "geoCity" VARCHAR(191),
    "geoTimezone" VARCHAR(64),
    "deviceType" VARCHAR(32),
    "browserName" VARCHAR(64),
    "operatingSystem" VARCHAR(64),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageView" (
    "id" VARCHAR(30) NOT NULL,
    "sessionId" VARCHAR(30) NOT NULL,
    "anonymousPageViewId" VARCHAR(191) NOT NULL,
    "path" VARCHAR(2048) NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "title" VARCHAR(512),
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "activeDurationSeconds" INTEGER NOT NULL DEFAULT 0,
    "maxScrollPercent" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorEvent" (
    "id" VARCHAR(30) NOT NULL,
    "siteId" VARCHAR(30) NOT NULL,
    "sessionId" VARCHAR(30) NOT NULL,
    "visitorId" VARCHAR(30),
    "type" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" VARCHAR(30) NOT NULL,
    "siteId" VARCHAR(30) NOT NULL,
    "visitorId" VARCHAR(30) NOT NULL,
    "sessionId" VARCHAR(30),
    "assignedAgentId" VARCHAR(30),
    "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" VARCHAR(30) NOT NULL,
    "threadId" VARCHAR(30) NOT NULL,
    "senderType" "ChatSenderType" NOT NULL,
    "agentId" VARCHAR(30),
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" VARCHAR(30) NOT NULL,
    "siteId" VARCHAR(30) NOT NULL,
    "visitorId" VARCHAR(30) NOT NULL,
    "sessionId" VARCHAR(30),
    "agentId" VARCHAR(30),
    "type" "CallType" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "roomName" VARCHAR(191),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "failureCode" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" VARCHAR(30) NOT NULL,
    "callId" VARCHAR(30) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentScoreSnapshot" (
    "id" VARCHAR(30) NOT NULL,
    "siteId" VARCHAR(30) NOT NULL,
    "visitorId" VARCHAR(30) NOT NULL,
    "sessionId" VARCHAR(30),
    "score" INTEGER NOT NULL,
    "reasons" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" VARCHAR(30) NOT NULL,
    "siteId" VARCHAR(30),
    "actorUserId" VARCHAR(30),
    "action" VARCHAR(128) NOT NULL,
    "entityType" VARCHAR(64) NOT NULL,
    "entityId" VARCHAR(191),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Site_publicKey_key" ON "Site"("publicKey");

-- CreateIndex
CREATE INDEX "SiteMember_userId_siteId_idx" ON "SiteMember"("userId", "siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteMember_siteId_userId_key" ON "SiteMember"("siteId", "userId");

-- CreateIndex
CREATE INDEX "Visitor_siteId_lastSeenAt_idx" ON "Visitor"("siteId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_siteId_anonymousId_key" ON "Visitor"("siteId", "anonymousId");

-- CreateIndex
CREATE INDEX "VisitorIdentity_provider_externalId_idx" ON "VisitorIdentity"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitorIdentity_visitorId_provider_externalId_key" ON "VisitorIdentity"("visitorId", "provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_anonymousSessionId_key" ON "Session"("anonymousSessionId");

-- CreateIndex
CREATE INDEX "Session_siteId_lastSeenAt_idx" ON "Session"("siteId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "Session_visitorId_lastSeenAt_idx" ON "Session"("visitorId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "PageView_anonymousPageViewId_key" ON "PageView"("anonymousPageViewId");

-- CreateIndex
CREATE INDEX "PageView_sessionId_enteredAt_idx" ON "PageView"("sessionId", "enteredAt");

-- CreateIndex
CREATE INDEX "VisitorEvent_siteId_type_createdAt_idx" ON "VisitorEvent"("siteId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "VisitorEvent_sessionId_createdAt_idx" ON "VisitorEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "VisitorEvent_visitorId_createdAt_idx" ON "VisitorEvent"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatThread_siteId_updatedAt_idx" ON "ChatThread"("siteId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatThread_visitorId_updatedAt_idx" ON "ChatThread"("visitorId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatThread_assignedAgentId_updatedAt_idx" ON "ChatThread"("assignedAgentId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_sentAt_idx" ON "ChatMessage"("threadId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Call_roomName_key" ON "Call"("roomName");

-- CreateIndex
CREATE INDEX "Call_visitorId_requestedAt_idx" ON "Call"("visitorId", "requestedAt");

-- CreateIndex
CREATE INDEX "Call_agentId_requestedAt_idx" ON "Call"("agentId", "requestedAt");

-- CreateIndex
CREATE INDEX "Call_siteId_requestedAt_idx" ON "Call"("siteId", "requestedAt");

-- CreateIndex
CREATE INDEX "Call_sessionId_requestedAt_idx" ON "Call"("sessionId", "requestedAt");

-- CreateIndex
CREATE INDEX "CallEvent_callId_createdAt_idx" ON "CallEvent"("callId", "createdAt");

-- CreateIndex
CREATE INDEX "IntentScoreSnapshot_siteId_capturedAt_idx" ON "IntentScoreSnapshot"("siteId", "capturedAt");

-- CreateIndex
CREATE INDEX "IntentScoreSnapshot_visitorId_capturedAt_idx" ON "IntentScoreSnapshot"("visitorId", "capturedAt");

-- CreateIndex
CREATE INDEX "IntentScoreSnapshot_sessionId_capturedAt_idx" ON "IntentScoreSnapshot"("sessionId", "capturedAt");

-- CreateIndex
CREATE INDEX "AuditLog_siteId_createdAt_idx" ON "AuditLog"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "SiteMember" ADD CONSTRAINT "SiteMember_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMember" ADD CONSTRAINT "SiteMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorIdentity" ADD CONSTRAINT "VisitorIdentity_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageView" ADD CONSTRAINT "PageView_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorEvent" ADD CONSTRAINT "VisitorEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorEvent" ADD CONSTRAINT "VisitorEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorEvent" ADD CONSTRAINT "VisitorEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentScoreSnapshot" ADD CONSTRAINT "IntentScoreSnapshot_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentScoreSnapshot" ADD CONSTRAINT "IntentScoreSnapshot_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentScoreSnapshot" ADD CONSTRAINT "IntentScoreSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
