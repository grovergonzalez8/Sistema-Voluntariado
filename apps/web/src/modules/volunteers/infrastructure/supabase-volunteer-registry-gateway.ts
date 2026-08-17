import {
  failure,
  success,
  type AppErrorCode,
  type Result,
} from '@sistema-voluntariado/shared-kernel';
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Database,
  Json,
} from '../../../shared/infrastructure/supabase/database.types';
import type {
  VolunteerListQuery,
  VolunteerImportCommandRow,
  VolunteerImportDuplicateQueryRow,
  VolunteerImportDuplicateMatch,
  VolunteerImportResult,
  VolunteerPage,
  VolunteerRegistryGateway,
  VolunteerSaveCommand,
  VolunteerUpdateCommand,
} from '../application/volunteer-registry-gateway';
import type {
  CanonicalVolunteerInput,
  RegisteredVolunteer,
} from '../domain/registered-volunteer';
import type {
  VolunteerDuplicateField,
  VolunteerDuplicateMatch,
} from '../domain/volunteer-duplicates';

interface SupabaseErrorLike {
  readonly message: string;
}

const errorCodes: Readonly<Record<string, AppErrorCode>> = {
  duplicate_confirmation_required: 'conflict',
  invalid_volunteer_query: 'validation',
  permission_denied: 'forbidden',
  volunteer_not_found: 'not-found',
};

function gatewayFailure<T>(error: SupabaseErrorLike): Result<T> {
  const code = errorCodes[error.message] ?? 'unexpected';
  const message =
    error.message === 'duplicate_confirmation_required'
      ? 'Se detectó una posible coincidencia. Revísala antes de confirmar.'
      : code === 'forbidden'
        ? 'No tienes permiso para administrar voluntarios.'
        : code === 'not-found'
          ? 'No se encontró el voluntario solicitado.'
          : code === 'validation'
            ? 'La solicitud de voluntarios no es válida.'
            : 'No fue posible completar la operación de voluntarios.';
  return failure({ code, message });
}

function mapVolunteer(row: {
  readonly created_at: string;
  readonly email: string | null;
  readonly full_name: string;
  readonly id: string;
  readonly phone: string | null;
  readonly updated_at: string;
}): RegisteredVolunteer {
  return {
    createdAt: row.created_at,
    email: row.email,
    fullName: row.full_name,
    id: row.id,
    phone: row.phone,
    updatedAt: row.updated_at,
  };
}

function isDuplicateField(value: string): value is VolunteerDuplicateField {
  return value === 'email' || value === 'phone';
}

export class SupabaseVolunteerRegistryGateway implements VolunteerRegistryGateway {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public async createVolunteer(
    command: VolunteerSaveCommand,
  ): Promise<Result<RegisteredVolunteer>> {
    const { data, error } = await this.client.rpc('create_volunteer', {
      accept_potential_duplicate: command.acceptPotentialDuplicate,
      requested_email: command.email,
      requested_full_name: command.fullName,
      requested_phone: command.phone,
    });
    if (error) return gatewayFailure(error);
    const row = data[0];
    return row
      ? success(mapVolunteer(row))
      : failure({
          code: 'unexpected',
          message: 'El servidor no devolvió el voluntario creado.',
        });
  }

  public async findPotentialDuplicates(
    input: CanonicalVolunteerInput,
    excludeId: string | null,
  ): Promise<Result<readonly VolunteerDuplicateMatch[]>> {
    const { data, error } = await this.client.rpc('find_volunteer_duplicates', {
      requested_email: input.email,
      requested_exclude_id: excludeId,
      requested_phone: input.phone,
    });
    if (error) return gatewayFailure(error);
    const matches: VolunteerDuplicateMatch[] = [];
    for (const row of data) {
      if (!row.matched_fields.every(isDuplicateField)) {
        return failure({
          code: 'unexpected',
          message: 'El servidor devolvió una coincidencia no válida.',
        });
      }
      matches.push({
        fullName: row.full_name,
        id: row.volunteer_id,
        matchedFields: row.matched_fields,
      });
    }
    return success(matches);
  }

  public async getVolunteer(id: string): Promise<Result<RegisteredVolunteer>> {
    const { data, error } = await this.client.rpc('get_volunteer_detail', {
      requested_volunteer_id: id,
    });
    if (error) return gatewayFailure(error);
    const row = data[0];
    return row
      ? success(mapVolunteer(row))
      : failure({
          code: 'not-found',
          message: 'No se encontró el voluntario solicitado.',
        });
  }

  public async importVolunteers(
    rows: readonly VolunteerImportCommandRow[],
  ): Promise<Result<VolunteerImportResult>> {
    const requestedRows: Json = rows.map((row) => ({
      acceptPotentialDuplicate: row.acceptPotentialDuplicate,
      email: row.email,
      fullName: row.fullName,
      phone: row.phone,
    }));
    const { data, error } = await this.client.rpc('import_volunteers', {
      requested_rows: requestedRows,
    });
    if (error) return gatewayFailure(error);
    const result = data[0];
    return result
      ? success({
          batchId: result.batch_id,
          insertedCount: result.inserted_count,
        })
      : failure({
          code: 'unexpected',
          message: 'El servidor no devolvió el resultado de la importación.',
        });
  }

  public async listVolunteers(
    query: VolunteerListQuery,
  ): Promise<Result<VolunteerPage>> {
    const { data, error } = await this.client.rpc('list_volunteers', {
      requested_limit: query.limit,
      requested_offset: query.offset,
      requested_search: query.search,
      requested_sort: query.sort,
    });
    if (error) return gatewayFailure(error);
    return success({
      items: data.map((row) =>
        mapVolunteer({
          ...row,
          id: row.volunteer_id,
        }),
      ),
      limit: query.limit,
      offset: query.offset,
      total: data[0]?.total_count ?? 0,
    });
  }

  public async previewImportDuplicates(
    rows: readonly VolunteerImportDuplicateQueryRow[],
  ): Promise<Result<readonly VolunteerImportDuplicateMatch[]>> {
    const requestedRows: Json = rows.map((row) => ({
      email: row.email,
      phone: row.phone,
      rowNumber: row.rowNumber,
    }));
    const { data, error } = await this.client.rpc(
      'preview_volunteer_import_duplicates',
      { requested_rows: requestedRows },
    );
    if (error) return gatewayFailure(error);
    const matches: VolunteerImportDuplicateMatch[] = [];
    for (const row of data) {
      if (!row.matched_fields.every(isDuplicateField)) {
        return failure({
          code: 'unexpected',
          message: 'El servidor devolvió una coincidencia no válida.',
        });
      }
      matches.push({
        fullName: row.full_name,
        id: row.volunteer_id,
        matchedFields: row.matched_fields,
        rowNumber: row.requested_row_number,
      });
    }
    return success(matches);
  }

  public async exportVolunteers(
    query: VolunteerListQuery,
  ): Promise<Result<readonly RegisteredVolunteer[]>> {
    const { data, error } = await this.client.rpc('export_volunteers', {
      requested_limit: query.limit,
      requested_offset: query.offset,
      requested_search: query.search,
      requested_sort: query.sort,
    });
    if (error) return gatewayFailure(error);
    return success(
      data.map((row) =>
        mapVolunteer({
          ...row,
          id: row.volunteer_id,
        }),
      ),
    );
  }

  public async updateVolunteer(
    command: VolunteerUpdateCommand,
  ): Promise<Result<RegisteredVolunteer>> {
    const { data, error } = await this.client.rpc('update_volunteer', {
      accept_potential_duplicate: command.acceptPotentialDuplicate,
      requested_email: command.email,
      requested_full_name: command.fullName,
      requested_phone: command.phone,
      requested_volunteer_id: command.id,
    });
    if (error) return gatewayFailure(error);
    const row = data[0];
    return row
      ? success(mapVolunteer(row))
      : failure({
          code: 'unexpected',
          message: 'El servidor no devolvió el voluntario actualizado.',
        });
  }
}
