// identity context — public surface.
export { IdentityServiceImpl } from './service.js';
export type {
  IdentityService,
  IdentityRepository,
  AuthAccountWriter,
  UserProvisioner,
  UserResolver,
  UserLinker,
  UserEditor,
} from './ports.js';
export type { User } from './model.js';
export type { UserId, CreateUserInput, ProvisionUserInput, UpdateUserInput } from './types.js';
