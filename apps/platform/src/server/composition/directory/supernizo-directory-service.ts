import { runtimeProviders } from '@/server/composition/runtime-providers';
import 'server-only';
import { createSupernizoDirectoryService } from '@/server/application/directory/supernizo-directory-service';
import { createSupernizoDirectoryRepository } from '@/server/infrastructure/repositories/supernizo-directory-repository';
export * from '@/server/application/directory/supernizo-directory-service';
const service = createSupernizoDirectoryService({
  ...runtimeProviders,
  repository: createSupernizoDirectoryRepository(),
});
export const {
  lockDirectoryUser,
  applyDirectoryState,
  synchronizeDirectoryEvent,
  synchronizeDirectoryState,
  provisionDirectoryIdentity,
  reconcileDirectoryUsers,
} = service;
