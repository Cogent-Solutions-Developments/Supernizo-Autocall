ALTER TABLE "User" ADD COLUMN "supernizoId" UUID;
CREATE UNIQUE INDEX "User_supernizoId_key" ON "User"("supernizoId");
