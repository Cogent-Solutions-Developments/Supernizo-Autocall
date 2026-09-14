ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INCOMING_CALL';

ALTER TABLE "Notification"
  ALTER COLUMN "threadId" DROP NOT NULL,
  ALTER COLUMN "messageId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "callId" VARCHAR(30);

ALTER TABLE "Call"
  ADD COLUMN IF NOT EXISTS "visitorInitiated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_callId_fkey"
  FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Notification_recipientUserId_type_callId_key"
  ON "Notification"("recipientUserId", "type", "callId");
