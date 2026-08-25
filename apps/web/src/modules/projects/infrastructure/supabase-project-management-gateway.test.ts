import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import { SupabaseProjectManagementGateway } from './supabase-project-management-gateway';

const projectRow = {
  created_at: '2026-08-24T10:00:00Z',
  description: null,
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Proyecto V1',
  status: 'active' as const,
  updated_at: '2026-08-24T10:00:00Z',
};

describe('SupabaseProjectManagementGateway', () => {
  it('maps project pagination and total without leaking database names', async () => {
    const rpc = vi.fn(() =>
      Promise.resolve({
        data: [
          {
            ...projectRow,
            id: undefined,
            project_id: projectRow.id,
            total_count: 3,
          },
        ],
        error: null,
      }),
    );
    const gateway = new SupabaseProjectManagementGateway({
      rpc,
    } as unknown as SupabaseClient<Database>);

    const result = await gateway.listProjects({
      limit: 25,
      offset: 0,
      search: 'v1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          {
            createdAt: projectRow.created_at,
            description: null,
            id: projectRow.id,
            name: projectRow.name,
            status: 'active',
            updatedAt: projectRow.updated_at,
          },
        ],
        limit: 25,
        offset: 0,
        total: 3,
      },
    });
    expect(rpc).toHaveBeenCalledWith('list_projects', {
      requested_limit: 25,
      requested_offset: 0,
      requested_search: 'v1',
    });
  });

  it('maps lifecycle conflicts to actionable application errors', async () => {
    const gateway = new SupabaseProjectManagementGateway({
      rpc: () =>
        Promise.resolve({
          data: null,
          error: { message: 'project_has_active_assignments' },
        }),
    } as unknown as SupabaseClient<Database>);

    const result = await gateway.closeProject(projectRow.id);

    expect(result).toEqual({
      error: {
        code: 'conflict',
        message:
          'Finaliza todas las asignaciones activas antes de cerrar el proyecto.',
      },
      ok: false,
    });
  });

  it('projects candidate selection to id and name only', async () => {
    const gateway = new SupabaseProjectManagementGateway({
      rpc: () =>
        Promise.resolve({
          data: [
            {
              full_name: 'Persona Uno',
              volunteer_id: '20000000-0000-4000-8000-000000000001',
            },
          ],
          error: null,
        }),
    } as unknown as SupabaseClient<Database>);

    expect(
      await gateway.searchVolunteerCandidates(projectRow.id, 'Uno'),
    ).toEqual({
      ok: true,
      value: [
        { fullName: 'Persona Uno', id: '20000000-0000-4000-8000-000000000001' },
      ],
    });
  });

  it('projects manager candidates without account or Auth metadata', async () => {
    const rpc = vi.fn(() =>
      Promise.resolve({
        data: [
          {
            display_name: 'Responsable Uno',
            manager_account_id: '30000000-0000-4000-8000-000000000001',
          },
        ],
        error: null,
      }),
    );
    const gateway = new SupabaseProjectManagementGateway({
      rpc,
    } as unknown as SupabaseClient<Database>);

    expect(await gateway.searchManagerCandidates(projectRow.id, 'Uno')).toEqual(
      {
        ok: true,
        value: [
          {
            displayName: 'Responsable Uno',
            managerAccountId: '30000000-0000-4000-8000-000000000001',
          },
        ],
      },
    );
    expect(rpc).toHaveBeenCalledWith('search_project_manager_candidates', {
      requested_limit: 20,
      requested_project_id: projectRow.id,
      requested_search: 'Uno',
    });
  });

  it('maps manager eligibility conflicts without exposing database details', async () => {
    const gateway = new SupabaseProjectManagementGateway({
      rpc: () =>
        Promise.resolve({
          data: null,
          error: { message: 'project_manager_not_eligible' },
        }),
    } as unknown as SupabaseClient<Database>);

    expect(
      await gateway.assignManager(
        projectRow.id,
        '30000000-0000-4000-8000-000000000001',
      ),
    ).toEqual({
      error: {
        code: 'conflict',
        message: 'La cuenta ya no es elegible como responsable de proyecto.',
      },
      ok: false,
    });
  });
});
