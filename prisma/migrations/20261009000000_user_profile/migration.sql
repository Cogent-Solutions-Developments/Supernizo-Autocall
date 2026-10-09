CREATE TABLE "UserProfile" (
    "userId" VARCHAR(30) NOT NULL,
    "displayName" VARCHAR(191) NOT NULL,
    "imageUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
