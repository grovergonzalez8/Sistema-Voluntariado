import { failure, type Result } from '@sistema-voluntariado/shared-kernel';

import type {
  AccountDetail,
  AccountSummary,
} from '../domain/account-administration';
import {
  normalizeAdministrativeReason,
  type AccountStatus,
} from '../domain/account-lifecycle';
import type { RoleMutationOperation } from '../domain/role-grant-policy';
import type {
  AccountAdministrationGateway,
  AccountListQuery,
} from './account-administration-gateway';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const validAdministrativeTargets: readonly AccountStatus[] = [
  'active',
  'suspended',
  'archived',
];

export class AccountAdministrationService {
  public constructor(private readonly gateway: AccountAdministrationGateway) {}

  public changeAccountStatus(input: {
    readonly accountId: string;
    readonly reason: string;
    readonly status: AccountStatus;
  }): Promise<Result<AccountDetail>> {
    const reason = normalizeAdministrativeReason(input.reason);
    if (!reason.ok) {
      return Promise.resolve(reason);
    }

    if (
      !uuidPattern.test(input.accountId) ||
      !validAdministrativeTargets.includes(input.status)
    ) {
      return Promise.resolve(
        failure({
          code: 'validation',
          message: 'El cambio de estado solicitado no es válido.',
        }),
      );
    }

    return this.gateway.changeAccountStatus({
      accountId: input.accountId,
      reason: reason.value,
      status: input.status,
    });
  }

  public getAccountDetail(accountId: string): Promise<Result<AccountDetail>> {
    if (!uuidPattern.test(accountId)) {
      return Promise.resolve(
        failure({
          code: 'validation',
          message: 'La cuenta solicitada no es válida.',
        }),
      );
    }

    return this.gateway.getAccountDetail(accountId);
  }

  public listAccounts(
    input: Partial<AccountListQuery> = {},
  ): Promise<Result<readonly AccountSummary[]>> {
    const limit = input.limit ?? 25;
    const offset = input.offset ?? 0;
    const search = input.search?.trim() ?? '';

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      search.length > 100
    ) {
      return Promise.resolve(
        failure({
          code: 'validation',
          message: 'Los filtros de cuentas no son válidos.',
        }),
      );
    }

    return this.gateway.listAccounts({ limit, offset, search });
  }

  public manageAccountRole(input: {
    readonly accountId: string;
    readonly operation: RoleMutationOperation;
    readonly roleCode: string;
  }): Promise<Result<AccountDetail>> {
    if (
      !uuidPattern.test(input.accountId) ||
      !/^[a-z][a-z0-9_]*$/.test(input.roleCode)
    ) {
      return Promise.resolve(
        failure({
          code: 'validation',
          message: 'La asignación de rol solicitada no es válida.',
        }),
      );
    }

    return this.gateway.manageAccountRole(input);
  }
}
