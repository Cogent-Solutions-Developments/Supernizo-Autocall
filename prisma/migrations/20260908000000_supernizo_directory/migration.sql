CREATE TABLE "SupernizoUserState" (
  "userId" VARCHAR(30) PRIMARY KEY,
  "eligibility" VARCHAR(16) NOT NULL CHECK ("eligibility" IN ('ELIGIBLE','REVOKED','DISABLED','DELETED')),
  "directoryRevision" BIGINT NOT NULL CHECK ("directoryRevision" > 0),
  "sourceChangedAt" TIMESTAMP(3) NOT NULL,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL,
  "stateHash" VARCHAR(64) NOT NULL,
  CONSTRAINT "SupernizoUserState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "SupernizoUserState_eligibility_idx" ON "SupernizoUserState"("eligibility");
CREATE TABLE "IntegrationInbox" (
  "eventId" UUID PRIMARY KEY,
  "subject" UUID NOT NULL,
  "payloadHash" VARCHAR(64) NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IntegrationInbox_processedAt_idx" ON "IntegrationInbox"("processedAt");
