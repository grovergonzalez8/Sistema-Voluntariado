import type { Result } from '@sistema-voluntariado/shared-kernel';

import type { AccountContext } from '../domain/account-administration';

export interface AccountContextGateway {
  getCurrentAccountContext(): Promise<Result<AccountContext | null>>;
}
