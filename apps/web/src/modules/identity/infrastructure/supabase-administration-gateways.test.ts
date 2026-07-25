import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import { SupabaseAccountAdministrationGateway } from './supabase-account-administration-gateway';
import { SupabaseInvitationAdministrationGateway } from './supabase-invitation-administration-gateway';

const accountId = '00000000-0000-4000-8000-000000000050';
const userId = '00000000-0000-4000-8000-000000000051';
const accountDetailRow = {
  account_id: accountId,
  account_status: 'active',
  audit: [],
  display_name: 'Cuenta local',
  email: 'account@example.invalid',
  grantable_roles: [],
  history: [],
  roles: ['administrator'],
  updated_at: '2026-07-24T00:00:00.000Z',
  user_id: userId,
};

describe('Supabase administration gateways', () => {
  it('maps a typed Edge Function denial instead of erasing its semantics', async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: {
          context: new Response(
            JSON.stringify({
              code: 'permission_denied',
              message: 'No autorizado.',
            }),
            { status: 403 },
          ),
          message: 'Edge Function returned a non-2xx status code',
        },
      }),
    );
    const client = {
      functions: { invoke },
    } as unknown as SupabaseClient<Database>;
    const gateway = new SupabaseInvitationAdministrationGateway(client);

    const result = await gateway.createInvitation({
      displayName: null,
      idempotencyKey: '00000000-0000-4000-8000-000000000052',
      normalizedEmail: 'invited@example.invalid',
      preferredLocale: 'es',
      requestedInitialRoleCode: 'volunteer',
    });

    expect(result).toMatchObject({ error: { code: 'forbidden' }, ok: false });
  });

  it('returns the committed self-suspension when the follow-up read is denied', async () => {
    const rpc = vi.fn((functionName: string) => {
      if (functionName === 'change_account_status') {
        return Promise.resolve({
          data: [
            {
              auth_user_id: userId,
              authority_version: 2,
              created_at: '2026-07-24T00:00:00.000Z',
              id: accountId,
              origin_invited_by: null,
              status: 'suspended',
              status_changed_at: '2026-07-24T00:01:00.000Z',
              updated_at: '2026-07-24T00:01:00.000Z',
            },
          ],
          error: null,
        });
      }
      if (rpc.mock.calls.length === 1) {
        return Promise.resolve({ data: [accountDetailRow], error: null });
      }
      return Promise.resolve({
        data: null,
        error: { message: 'permission_denied' },
      });
    });
    const client = {
      auth: {
        getUser: () =>
          Promise.resolve({ data: { user: { id: userId } }, error: null }),
      },
      rpc,
    } as unknown as SupabaseClient<Database>;
    const gateway = new SupabaseAccountAdministrationGateway(client);

    const result = await gateway.changeAccountStatus({
      accountId,
      reason: 'Suspensión propia autorizada',
      status: 'suspended',
    });

    expect(result).toMatchObject({
      ok: true,
      value: { accountId, status: 'suspended' },
    });
  });
});
