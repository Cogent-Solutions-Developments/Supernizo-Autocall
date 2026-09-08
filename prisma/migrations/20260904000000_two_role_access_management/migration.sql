-- Existing read-only users become agents before the enum is narrowed.
UPDATE "User"
SET "globalRole" = 'AGENT'
WHERE "globalRole" = 'VIEWER';

-- Site membership now represents assignment only. The user's global role is
-- the single source of truth for authorization.
ALTER TABLE "SiteMember" DROP COLUMN "role";

CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'AGENT');

ALTER TABLE "User" ALTER COLUMN "globalRole" DROP DEFAULT;
ALTER TABLE "User"
ALTER COLUMN "globalRole" TYPE "UserRole_new"
USING ("globalRole"::text::"UserRole_new");
ALTER TABLE "User" ALTER COLUMN "globalRole" SET DEFAULT 'AGENT';

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
