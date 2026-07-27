import { success, type Result } from '@sistema-voluntariado/shared-kernel';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import type { AccountContextGateway } from '../application/account-context-gateway';
import type { AccountContext } from '../domain/account-administration';
import { isAccountStatus } from '../domain/account-lifecycle';
import { supabaseFailure, unknownFailure } from './supabase-gateway-result';

export class SupabaseAccountContextGateway implements AccountContextGateway {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public async getCurrentAccountContext(): Promise<
    Result<AccountContext | null>
  > {
    const { data, error } = await this.client.rpc('get_my_account_context');
    if (error) return supabaseFailure(error);
    const row = data[0];
    if (!row) return success(null);
    if (!isAccountStatus(row.account_status)) return unknownFailure();

    return success({
      accountId: row.account_id,
      authorityVersion: String(row.authority_version),
      permissions: row.permissions,
      status: row.account_status,
    });
  }
}
