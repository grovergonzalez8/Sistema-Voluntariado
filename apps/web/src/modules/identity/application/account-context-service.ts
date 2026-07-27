import type { Result } from '@sistema-voluntariado/shared-kernel';

import type { AccountContext } from '../domain/account-administration';
import type { AccountContextGateway } from './account-context-gateway';

export class AccountContextService {
  public constructor(private readonly gateway: AccountContextGateway) {}

  public getCurrentAccountContext(): Promise<Result<AccountContext | null>> {
    return this.gateway.getCurrentAccountContext();
  }
}
