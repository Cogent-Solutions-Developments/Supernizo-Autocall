CREATE TYPE "ChatFollowUpStatus" AS ENUM ('NEEDS_REPLY', 'FOLLOW_UP_PENDING', 'RESOLVED');
CREATE TYPE "ChatContactChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'BOTH');
ALTER TABLE "ChatThread"
  ADD COLUMN "followUpStatus" "ChatFollowUpStatus" NOT NULL DEFAULT 'NEEDS_REPLY',
  ADD COLUMN "contactEmail" VARCHAR(254),
  ADD COLUMN "contactWhatsApp" VARCHAR(16),
  ADD COLUMN "contactChannel" "ChatContactChannel",
  ADD COLUMN "contactConsentAt" TIMESTAMP(3),
  ADD COLUMN "contactConsentVersion" VARCHAR(64);
