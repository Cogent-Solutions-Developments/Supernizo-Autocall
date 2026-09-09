ALTER TABLE "Notification"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Notification_updatedAt_id_idx" ON "Notification"("updatedAt", "id");
