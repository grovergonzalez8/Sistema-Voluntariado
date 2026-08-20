import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import { SupabaseVolunteerRegistryGateway } from './supabase-volunteer-registry-gateway';

const row = {
  created_at: '2026-08-16T12:00:00.000Z',
  email: 'persona@example.invalid',
  full_name: 'Persona Registrada',
  id: '00000000-0000-4000-8000-000000000101',
  phone: '+591 70000000',
  phone_match_key: '59170000000',
  updated_at: '2026-08-16T12:00:00.000Z',
};

describe('SupabaseVolunteerRegistryGateway', () => {
  it('maps a paginated server projection and its total', async () => {
    const rpc = vi.fn(() =>
      Promise.resolve({
        data: [{ ...row, total_count: 42, volunteer_id: row.id }],
        error: null,
      }),
    );
    const gateway = new SupabaseVolunteerRegistryGateway({
      rpc,
    } as unknown as SupabaseClient<Database>);

    const result = await gateway.listVolunteers({
      limit: 25,
      offset: 25,
      search: 'persona',
      sort: 'name_asc',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          {
            createdAt: row.created_at,
            email: row.email,
            fullName: row.full_name,
            id: row.id,
            phone: row.phone,
            updatedAt: row.updated_at,
          },
        ],
        limit: 25,
        offset: 25,
        total: 42,
      },
    });
    expect(rpc).toHaveBeenCalledWith('list_volunteers', {
      requested_limit: 25,
      requested_offset: 25,
      requested_search: 'persona',
      requested_sort: 'name_asc',
    });
  });

  it('maps duplicate evidence without exposing raw database shapes', async () => {
    const rpc = vi.fn(() =>
      Promise.resolve({
        data: [
          {
            full_name: row.full_name,
            matched_fields: ['email', 'phone'],
            volunteer_id: row.id,
          },
        ],
        error: null,
      }),
    );
    const gateway = new SupabaseVolunteerRegistryGateway({
      rpc,
    } as unknown as SupabaseClient<Database>);

    const result = await gateway.findPotentialDuplicates(
      { email: row.email, fullName: 'Otro', phone: row.phone },
      null,
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          fullName: row.full_name,
          id: row.id,
          matchedFields: ['email', 'phone'],
        },
      ],
    });
  });

  it('keeps duplicate confirmation as an explicit conflict', async () => {
    const gateway = new SupabaseVolunteerRegistryGateway({
      rpc: () =>
        Promise.resolve({
          data: null,
          error: { message: 'duplicate_confirmation_required' },
        }),
    } as unknown as SupabaseClient<Database>);

    const result = await gateway.createVolunteer({
      acceptPotentialDuplicate: false,
      email: row.email,
      fullName: row.full_name,
      phone: null,
    });

    expect(result).toMatchObject({ error: { code: 'conflict' }, ok: false });
  });
});
