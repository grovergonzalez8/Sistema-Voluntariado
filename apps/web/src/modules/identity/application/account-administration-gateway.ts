import type { Result } from '@sistema-voluntariado/shared-kernel';

import type {
  AccountDetail,
  AccountSummary,
} from '../domain/account-administration';
import type { AccountStatus } from '../domain/account-lifecycle';
import type { RoleMutationOperation } from '../domain/role-grant-policy';

export interface AccountListQuery {
  readonly limit: number;
  readonly offset: number;
  readonly search: string;
}

export interface ChangeAccountStatusCommand {
  readonly accountId: string;
  readonly reason: string;
  readonly status: AccountStatus;
}

export interface ManageAccountRoleCommand {
  readonly accountId: string;
  readonly operation: RoleMutationOperation;
  readonly roleCode: string;
}

export interface AccountAdministrationGateway {
  changeAccountStatus(
    input: ChangeAccountStatusCommand,
  ): Promise<Result<AccountDetail>>;
  getAccountDetail(accountId: string): Promise<Result<AccountDetail>>;
  listAccounts(
    query: AccountListQuery,
  ): Promise<Result<readonly AccountSummary[]>>;
  manageAccountRole(
    input: ManageAccountRoleCommand,
  ): Promise<Result<AccountDetail>>;
}
