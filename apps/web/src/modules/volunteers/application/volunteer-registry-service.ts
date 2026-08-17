import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import {
  isVolunteerSort,
  phoneMatchKey,
  validateVolunteerInput,
  type CanonicalVolunteerInput,
  type RegisteredVolunteer,
  type VolunteerInput,
} from '../domain/registered-volunteer';
import type { VolunteerDuplicateMatch } from '../domain/volunteer-duplicates';
import type {
  VolunteerImportConfirmation,
  VolunteerImportDuplicateEvidence,
  VolunteerImportPreview,
  VolunteerImportPreviewRow,
} from '../domain/volunteer-import';
import type {
  VolunteerAuthorizationPort,
  VolunteerRegistryPermission,
} from './volunteer-authorization-port';
import type {
  VolunteerImportDuplicateMatch,
  VolunteerListQuery,
  VolunteerPage,
  VolunteerRegistryGateway,
} from './volunteer-registry-gateway';
import type { VolunteerWorkbookGateway } from './volunteer-workbook-gateway';

export const volunteerImportLimits = {
  maxFileBytes: 5 * 1024 * 1024,
  maxRows: 1000,
} as const;

const expectedWorkbookHeaders = ['nombre completo', 'correo', 'celular'];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type VolunteerSaveResult =
  | {
      readonly duplicateMatches: readonly VolunteerDuplicateMatch[];
      readonly kind: 'duplicate-warning';
    }
  | {
      readonly kind: 'saved';
      readonly volunteer: RegisteredVolunteer;
    };

export class VolunteerRegistryService {
  public constructor(
    private readonly authorization: VolunteerAuthorizationPort,
    private readonly gateway: VolunteerRegistryGateway,
    private readonly workbook?: VolunteerWorkbookGateway,
  ) {}

  private async authorize(
    permission: VolunteerRegistryPermission,
  ): Promise<Result<true>> {
    const result = await this.authorization.hasPermission(permission);
    if (!result.ok) return result;
    return result.value
      ? success(true)
      : failure({
          code: 'forbidden',
          message: 'No tienes permiso para administrar voluntarios.',
        });
  }

  public async createVolunteer(
    input: VolunteerInput,
    acceptPotentialDuplicate = false,
  ): Promise<Result<VolunteerSaveResult>> {
    const canonical = validateVolunteerInput(input);
    if (!canonical.ok) {
      return failure({
        code: 'validation',
        message: 'Revisa los datos del voluntario.',
      });
    }

    const authorized = await this.authorize('volunteer_registry.create');
    if (!authorized.ok) return authorized;
    return this.saveNewVolunteer(canonical.value, acceptPotentialDuplicate);
  }

  private async saveNewVolunteer(
    input: CanonicalVolunteerInput,
    acceptPotentialDuplicate: boolean,
  ): Promise<Result<VolunteerSaveResult>> {
    const duplicates = await this.gateway.findPotentialDuplicates(input, null);
    if (!duplicates.ok) return duplicates;
    if (duplicates.value.length > 0 && !acceptPotentialDuplicate) {
      return success({
        duplicateMatches: duplicates.value,
        kind: 'duplicate-warning',
      });
    }

    const saved = await this.gateway.createVolunteer({
      ...input,
      acceptPotentialDuplicate,
    });
    return saved.ok
      ? success({ kind: 'saved', volunteer: saved.value })
      : saved;
  }

  public async getVolunteer(id: string): Promise<Result<RegisteredVolunteer>> {
    if (!uuidPattern.test(id)) {
      return failure({
        code: 'validation',
        message: 'El voluntario solicitado no es válido.',
      });
    }
    const authorized = await this.authorize('volunteer_registry.read');
    return authorized.ok ? this.gateway.getVolunteer(id) : authorized;
  }

  public async listVolunteers(
    input: Partial<VolunteerListQuery> = {},
  ): Promise<Result<VolunteerPage>> {
    const limit = input.limit ?? 25;
    const offset = input.offset ?? 0;
    const search = input.search?.trim() ?? '';
    const sort = input.sort ?? 'newest';
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      search.length > 100 ||
      !isVolunteerSort(sort)
    ) {
      return failure({
        code: 'validation',
        message: 'Los filtros de voluntarios no son válidos.',
      });
    }
    const authorized = await this.authorize('volunteer_registry.read');
    return authorized.ok
      ? this.gateway.listVolunteers({ limit, offset, search, sort })
      : authorized;
  }

  public async updateVolunteer(
    id: string,
    input: VolunteerInput,
    acceptPotentialDuplicate = false,
  ): Promise<Result<VolunteerSaveResult>> {
    if (!uuidPattern.test(id)) {
      return failure({
        code: 'validation',
        message: 'El voluntario solicitado no es válido.',
      });
    }
    const canonical = validateVolunteerInput(input);
    if (!canonical.ok) {
      return failure({
        code: 'validation',
        message: 'Revisa los datos del voluntario.',
      });
    }
    const authorized = await this.authorize('volunteer_registry.update');
    if (!authorized.ok) return authorized;
    const duplicates = await this.gateway.findPotentialDuplicates(
      canonical.value,
      id,
    );
    if (!duplicates.ok) return duplicates;
    if (duplicates.value.length > 0 && !acceptPotentialDuplicate) {
      return success({
        duplicateMatches: duplicates.value,
        kind: 'duplicate-warning',
      });
    }
    const saved = await this.gateway.updateVolunteer({
      ...canonical.value,
      acceptPotentialDuplicate,
      id,
    });
    return saved.ok
      ? success({ kind: 'saved', volunteer: saved.value })
      : saved;
  }

  public async previewImport(
    buffer: ArrayBuffer,
  ): Promise<Result<VolunteerImportPreview>> {
    if (
      buffer.byteLength === 0 ||
      buffer.byteLength > volunteerImportLimits.maxFileBytes
    ) {
      return failure({
        code: 'validation',
        message: 'El archivo debe ser .xlsx y no superar 5 MiB.',
      });
    }
    const authorized = await this.authorize('volunteer_registry.import');
    if (!authorized.ok) return authorized;
    if (!this.workbook) {
      return failure({
        code: 'configuration',
        message: 'La importación Excel no está disponible.',
      });
    }
    const parsed = await this.workbook.parse(buffer);
    if (!parsed.ok) return parsed;
    const [header, ...dataRows] = parsed.value;
    if (!header || !this.hasExpectedHeaders(header)) {
      return failure({
        code: 'validation',
        message:
          'La primera fila debe contener: Nombre completo, Correo, Celular.',
      });
    }

    const nonEmptyRows = dataRows
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(({ row }) => !this.isEmptyWorkbookRow(row));
    if (nonEmptyRows.length > volunteerImportLimits.maxRows) {
      return failure({
        code: 'validation',
        message: 'El archivo no puede contener más de 1.000 filas de datos.',
      });
    }

    const previewRows: VolunteerImportPreviewRow[] = nonEmptyRows.map(
      ({ row, rowNumber }) => this.validateWorkbookRow(row, rowNumber),
    );
    const internalDuplicates = this.findInternalImportDuplicates(previewRows);
    const canonicalRows = previewRows.filter(
      (
        row,
      ): row is VolunteerImportPreviewRow & {
        readonly canonical: CanonicalVolunteerInput;
      } => row.canonical !== null,
    );
    let databaseDuplicates: readonly VolunteerImportDuplicateMatch[] = [];
    if (canonicalRows.length > 0) {
      const duplicateResult = await this.gateway.previewImportDuplicates(
        canonicalRows.map((row) => ({
          email: row.canonical.email,
          phone: row.canonical.phone,
          rowNumber: row.rowNumber,
        })),
      );
      if (!duplicateResult.ok) return duplicateResult;
      databaseDuplicates = duplicateResult.value;
    }

    const rows = previewRows.map((row) => {
      const evidence = [
        ...(internalDuplicates.get(row.rowNumber) ?? []),
        ...databaseDuplicates
          .filter((match) => match.rowNumber === row.rowNumber)
          .map<VolunteerImportDuplicateEvidence>((match) => ({
            fullName: match.fullName,
            matchedFields: match.matchedFields,
            source: 'database',
          })),
      ];
      return { ...row, duplicateEvidence: evidence };
    });
    const invalidCount = rows.filter((row) => row.errors.length > 0).length;
    const duplicateCount = rows.filter(
      (row) => row.errors.length === 0 && row.duplicateEvidence.length > 0,
    ).length;
    return success({
      duplicateCount,
      invalidCount,
      rows,
      totalDetected: rows.length,
      validCount: rows.length - invalidCount - duplicateCount,
    });
  }

  private hasExpectedHeaders(
    row: readonly (boolean | Date | number | string | null)[],
  ): boolean {
    const normalized = row.map((cell) =>
      typeof cell === 'string' ? cell.trim().toLowerCase() : cell,
    );
    return (
      expectedWorkbookHeaders.every(
        (header, index) => normalized[index] === header,
      ) && normalized.slice(3).every((cell) => cell === null || cell === '')
    );
  }

  private isEmptyWorkbookRow(
    row: readonly (boolean | Date | number | string | null)[],
  ): boolean {
    return row.every(
      (cell) =>
        cell === null || (typeof cell === 'string' && cell.trim() === ''),
    );
  }

  private validateWorkbookRow(
    row: readonly (boolean | Date | number | string | null)[],
    rowNumber: number,
  ): VolunteerImportPreviewRow {
    const errors: string[] = [];
    const values = row.slice(0, 3);
    const labels = ['Nombre completo', 'Correo', 'Celular'];
    values.forEach((cell, index) => {
      if (cell !== null && typeof cell !== 'string') {
        errors.push(
          `${labels[index] ?? 'Celda'} debe estar guardado como texto.`,
        );
      } else if (typeof cell === 'string' && cell.trim().startsWith('=')) {
        errors.push(`${labels[index] ?? 'Celda'} no admite fórmulas.`);
      }
    });
    if (row.slice(3).some((cell) => cell !== null && cell !== '')) {
      errors.push('La fila contiene columnas adicionales no admitidas.');
    }
    const input: VolunteerInput = {
      email: typeof values[1] === 'string' ? values[1] : '',
      fullName: typeof values[0] === 'string' ? values[0] : '',
      phone: typeof values[2] === 'string' ? values[2] : '',
    };
    const validation = validateVolunteerInput(input);
    if (!validation.ok) {
      errors.push(...Object.values(validation.errors));
    }
    return {
      canonical: errors.length === 0 && validation.ok ? validation.value : null,
      duplicateEvidence: [],
      errors,
      rowNumber,
    };
  }

  private findInternalImportDuplicates(
    rows: readonly VolunteerImportPreviewRow[],
  ): ReadonlyMap<number, readonly VolunteerImportDuplicateEvidence[]> {
    const evidence = new Map<number, VolunteerImportDuplicateEvidence[]>();
    for (const row of rows) {
      if (!row.canonical) continue;
      for (const candidate of rows) {
        if (candidate.rowNumber === row.rowNumber || !candidate.canonical) {
          continue;
        }
        const matchedFields: ('email' | 'phone')[] = [];
        if (
          row.canonical.email !== null &&
          row.canonical.email === candidate.canonical.email
        ) {
          matchedFields.push('email');
        }
        const rowPhoneKey = phoneMatchKey(row.canonical.phone);
        if (
          rowPhoneKey !== null &&
          rowPhoneKey === phoneMatchKey(candidate.canonical.phone)
        ) {
          matchedFields.push('phone');
        }
        if (matchedFields.length > 0) {
          const current = evidence.get(row.rowNumber) ?? [];
          if (
            !current.some(
              (item) => item.fullName === candidate.canonical?.fullName,
            )
          ) {
            current.push({
              fullName: candidate.canonical.fullName,
              matchedFields,
              source: 'file',
            });
            evidence.set(row.rowNumber, current);
          }
        }
      }
    }
    return evidence;
  }

  public async confirmImport(
    preview: VolunteerImportPreview,
    acceptedDuplicateRows: readonly number[],
  ): Promise<Result<VolunteerImportConfirmation>> {
    const authorized = await this.authorize('volunteer_registry.import');
    if (!authorized.ok) return authorized;
    const accepted = new Set(acceptedDuplicateRows);
    const selected = preview.rows.filter(
      (
        row,
      ): row is VolunteerImportPreviewRow & {
        readonly canonical: CanonicalVolunteerInput;
      } =>
        row.canonical !== null &&
        row.errors.length === 0 &&
        (row.duplicateEvidence.length === 0 || accepted.has(row.rowNumber)),
    );
    if (selected.length === 0) {
      return failure({
        code: 'validation',
        message: 'No hay filas válidas seleccionadas para importar.',
      });
    }
    const result = await this.gateway.importVolunteers(
      selected.map((row) => ({
        ...row.canonical,
        acceptPotentialDuplicate: row.duplicateEvidence.length > 0,
      })),
    );
    return result.ok
      ? success({
          batchId: result.value.batchId,
          insertedCount: result.value.insertedCount,
        })
      : result;
  }

  public async createImportTemplate(): Promise<Result<ArrayBuffer>> {
    const authorized = await this.authorize('volunteer_registry.import');
    if (!authorized.ok) return authorized;
    return this.workbook
      ? this.workbook.createTemplate()
      : failure({
          code: 'configuration',
          message: 'La plantilla Excel no está disponible.',
        });
  }

  public async createExport(
    input: Pick<VolunteerListQuery, 'search' | 'sort'>,
  ): Promise<Result<ArrayBuffer>> {
    const search = input.search.trim();
    if (search.length > 100 || !isVolunteerSort(input.sort)) {
      return failure({
        code: 'validation',
        message: 'Los filtros de exportación no son válidos.',
      });
    }
    const authorized = await this.authorize('volunteer_registry.export');
    if (!authorized.ok) return authorized;
    if (!this.workbook) {
      return failure({
        code: 'configuration',
        message: 'La exportación Excel no está disponible.',
      });
    }
    const volunteers: RegisteredVolunteer[] = [];
    const exportPageSize = 1000;
    let pageLength: number;
    do {
      const page = await this.gateway.exportVolunteers({
        limit: exportPageSize,
        offset: volunteers.length,
        search,
        sort: input.sort,
      });
      if (!page.ok) return page;
      volunteers.push(...page.value);
      pageLength = page.value.length;
    } while (pageLength === exportPageSize);
    return this.workbook.createExport(volunteers);
  }
}
