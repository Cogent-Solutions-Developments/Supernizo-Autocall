CREATE TYPE "NotificationType" AS ENUM ('CHAT_MESSAGE');

CREATE TABLE "Notification" (
  "id" VARCHAR(30) NOT NULL,
  "type" "NotificationType" NOT NULL,
  "recipientUserId" VARCHAR(30) NOT NULL,
  "siteId" VARCHAR(30) NOT NULL,
  "siteName" VARCHAR(191) NOT NULL,
  "threadId" VARCHAR(30) NOT NULL,
  "messageId" VARCHAR(30) NOT NULL,
  "visitorId" VARCHAR(30) NOT NULL,
  "visitorLabel" VARCHAR(191) NOT NULL,
  "preview" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Notification_recipientUserId_type_messageId_key" ON "Notification"("recipientUserId", "type", "messageId");
CREATE INDEX "Notification_recipientUserId_readAt_createdAt_idx" ON "Notification"("recipientUserId", "readAt", "createdAt");
CREATE INDEX "Notification_siteId_createdAt_idx" ON "Notification"("siteId", "createdAt");
