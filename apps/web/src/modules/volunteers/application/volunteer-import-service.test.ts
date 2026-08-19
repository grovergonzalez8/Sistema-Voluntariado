import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import type { VolunteerAuthorizationPort } from './volunteer-authorization-port';
import type { VolunteerRegistryGateway } from './volunteer-registry-gateway';
import { VolunteerRegistryService } from './volunteer-registry-service';
import type { VolunteerWorkbookGateway } from './volunteer-workbook-gateway';

const authorization: VolunteerAuthorizationPort = {
  hasPermission: () => Promise.resolve(success(true)),
};

function gateway(
  overrides: Partial<VolunteerRegistryGateway> = {},
): VolunteerRegistryGateway {
  return {
    createVolunteer: () =>
      Promise.reject(new Error('not used in import tests')),
    exportVolunteers: () => Promise.resolve(success([])),
    findPotentialDuplicates: () => Promise.resolve(success([])),
    getVolunteer: () => Promise.reject(new Error('not used in import tests')),
    importVolunteers: (rows) =>
      Promise.resolve(
        success({
          batchId: '00000000-0000-4000-8000-000000000150',
          insertedCount: rows.length,
        }),
      ),
    listVolunteers: () => Promise.reject(new Error('not used in import tests')),
    previewImportDuplicates: () => Promise.resolve(success([])),
    updateVolunteer: () =>
      Promise.reject(new Error('not used in import tests')),
    ...overrides,
  };
}

function workbook(
  rows: readonly (readonly (boolean | Date | number | string | null)[])[],
  overrides: Partial<VolunteerWorkbookGateway> = {},
): VolunteerWorkbookGateway {
  return {
    createExport: () => Promise.resolve(success(new ArrayBuffer(8))),
    createTemplate: () => Promise.resolve(success(new ArrayBuffer(8))),
    parse: () => Promise.resolve(success(rows)),
    ...overrides,
  };
}

describe('volunteer Excel import service', () => {
  it('enforces the compressed file boundary before parsing', async () => {
    const parse = vi
      .fn<VolunteerWorkbookGateway['parse']>()
      .mockResolvedValue(success([['Nombre completo', 'Correo', 'Celular']]));
    const service = new VolunteerRegistryService(
      authorization,
      gateway(),
      workbook([], { parse }),
    );

    await expect(
      service.previewImport(new ArrayBuffer(5 * 1024 * 1024)),
    ).resolves.toMatchObject({ ok: true });
    expect(parse).toHaveBeenCalledTimes(1);

    await expect(
      service.previewImport(new ArrayBuffer(5 * 1024 * 1024 + 1)),
    ).resolves.toMatchObject({ error: { code: 'validation' }, ok: false });
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('accepts 1,000 data rows and rejects 1,001', async () => {
    const header = ['Nombre completo', 'Correo', 'Celular'] as const;
    const rows = Array.from({ length: 1001 }, (_, index) => [
      `Persona ${String(index)}`,
      null,
      null,
    ]);
    const accepted = new VolunteerRegistryService(
      authorization,
      gateway(),
      workbook([header, ...rows.slice(0, 1000)]),
    );
    const rejected = new VolunteerRegistryService(
      authorization,
      gateway(),
      workbook([header, ...rows]),
    );

    await expect(
      accepted.previewImport(new ArrayBuffer(16)),
    ).resolves.toMatchObject({ ok: true, value: { totalDetected: 1000 } });
    await expect(
      rejected.previewImport(new ArrayBuffer(16)),
    ).resolves.toMatchObject({ error: { code: 'validation' }, ok: false });
  });

  it('accepts a valid workbook, ignores empty rows and reports invalid rows', async () => {
    const service = new VolunteerRegistryService(
      authorization,
      gateway(),
      workbook([
        ['Nombre completo', 'Correo', 'Celular'],
        ['Fila válida', 'VALIDA@EXAMPLE.INVALID', '+591 70000001'],
        [null, ' ', null],
        ['Celular numérico', null, 70000002],
      ]),
    );

    const result = await service.previewImport(new ArrayBuffer(32));

    expect(result).toMatchObject({
      ok: true,
      value: {
        duplicateCount: 0,
        invalidCount: 1,
        totalDetected: 2,
        validCount: 1,
      },
    });
    if (result.ok) {
      expect(result.value.rows[0]?.canonical).toEqual({
        email: 'valida@example.invalid',
        fullName: 'Fila válida',
        phone: '+591 70000001',
      });
      expect(result.value.rows[1]?.errors).toContain(
        'Celular debe estar guardado como texto.',
      );
    }
  });

  it('rejects invalid headers and literal formula-like text', async () => {
    const invalidHeaderService = new VolunteerRegistryService(
      authorization,
      gateway(),
      workbook([['Nombre', 'Email', 'Teléfono']]),
    );
    expect(
      await invalidHeaderService.previewImport(new ArrayBuffer(16)),
    ).toMatchObject({ error: { code: 'validation' }, ok: false });

    const previewImportDuplicates =
      vi.fn<VolunteerRegistryGateway['previewImportDuplicates']>();
    const formulaService = new VolunteerRegistryService(
      authorization,
      gateway({ previewImportDuplicates }),
      workbook([
        ['Nombre completo', 'Correo', 'Celular'],
        ['=CONCAT(A1,B1)', null, null],
      ]),
    );
    const formula = await formulaService.previewImport(new ArrayBuffer(16));
    expect(formula).toMatchObject({
      ok: true,
      value: { invalidCount: 1, validCount: 0 },
    });
    expect(previewImportDuplicates).not.toHaveBeenCalled();
  });

  it('detects duplicates inside the workbook and in PostgreSQL', async () => {
    const previewImportDuplicates = vi
      .fn<VolunteerRegistryGateway['previewImportDuplicates']>()
      .mockResolvedValue(
        success([
          {
            fullName: 'Registro en base',
            id: '00000000-0000-4000-8000-000000000151',
            matchedFields: ['email'],
            rowNumber: 2,
          },
        ]),
      );
    const service = new VolunteerRegistryService(
      authorization,
      gateway({ previewImportDuplicates }),
      workbook([
        ['Nombre completo', 'Correo', 'Celular'],
        ['Primera', 'duplicada@example.invalid', '+591 70000001'],
        ['Segunda', 'DUPLICADA@EXAMPLE.INVALID', null],
      ]),
    );

    const result = await service.previewImport(new ArrayBuffer(32));

    expect(result).toMatchObject({
      ok: true,
      value: { duplicateCount: 2, invalidCount: 0, validCount: 0 },
    });
    if (result.ok) {
      expect(result.value.rows[0]?.duplicateEvidence).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'file' }),
          expect.objectContaining({ source: 'database' }),
        ]),
      );
    }
    expect(previewImportDuplicates).toHaveBeenCalledTimes(1);
  });

  it('imports valid rows and only explicitly accepted duplicates as one batch', async () => {
    const importVolunteers = vi
      .fn<VolunteerRegistryGateway['importVolunteers']>()
      .mockResolvedValue(
        success({
          batchId: '00000000-0000-4000-8000-000000000150',
          insertedCount: 2,
        }),
      );
    const service = new VolunteerRegistryService(
      authorization,
      gateway({ importVolunteers }),
      workbook([]),
    );
    const preview = {
      duplicateCount: 1,
      invalidCount: 1,
      rows: [
        {
          canonical: {
            email: null,
            fullName: 'Válida',
            phone: null,
          },
          duplicateEvidence: [],
          errors: [],
          rowNumber: 2,
        },
        {
          canonical: {
            email: 'duplicada@example.invalid',
            fullName: 'Duplicada legítima',
            phone: null,
          },
          duplicateEvidence: [
            {
              fullName: 'Anterior',
              matchedFields: ['email'] as const,
              source: 'database' as const,
            },
          ],
          errors: [],
          rowNumber: 3,
        },
        {
          canonical: null,
          duplicateEvidence: [],
          errors: ['Inválida'],
          rowNumber: 4,
        },
      ],
      totalDetected: 3,
      validCount: 1,
    };

    const result = await service.confirmImport(preview, [3]);

    expect(result).toMatchObject({ ok: true, value: { insertedCount: 2 } });
    expect(importVolunteers).toHaveBeenCalledWith([
      {
        acceptPotentialDuplicate: false,
        email: null,
        fullName: 'Válida',
        phone: null,
      },
      {
        acceptPotentialDuplicate: true,
        email: 'duplicada@example.invalid',
        fullName: 'Duplicada legítima',
        phone: null,
      },
    ]);
  });

  it('exports the complete filtered set through paginated database reads', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      createdAt: '2026-08-16T12:00:00.000Z',
      email: null,
      fullName: `Persona ${String(index)}`,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      phone: null,
      updatedAt: '2026-08-16T12:00:00.000Z',
    }));
    const finalPage = [
      {
        createdAt: '2026-08-16T12:00:00.000Z',
        email: null,
        fullName: 'Persona final',
        id: '00000000-0000-4000-8000-000000001001',
        phone: null,
        updatedAt: '2026-08-16T12:00:00.000Z',
      },
    ];
    const exportVolunteers = vi
      .fn<VolunteerRegistryGateway['exportVolunteers']>()
      .mockResolvedValueOnce(success(firstPage))
      .mockResolvedValueOnce(success(finalPage));
    const createExport = vi
      .fn<VolunteerWorkbookGateway['createExport']>()
      .mockResolvedValue(success(new ArrayBuffer(64)));
    const service = new VolunteerRegistryService(
      authorization,
      gateway({ exportVolunteers }),
      workbook([], { createExport }),
    );

    const result = await service.createExport({
      search: 'histórica',
      sort: 'oldest',
    });

    expect(result).toMatchObject({ ok: true });
    expect(exportVolunteers).toHaveBeenNthCalledWith(1, {
      limit: 1000,
      offset: 0,
      search: 'histórica',
      sort: 'oldest',
    });
    expect(exportVolunteers).toHaveBeenNthCalledWith(2, {
      limit: 1000,
      offset: 1000,
      search: 'histórica',
      sort: 'oldest',
    });
    expect(createExport).toHaveBeenCalledWith([...firstPage, ...finalPage]);
  });
});
