import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import writeXlsxFile from 'write-excel-file/universal';

import { success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { VolunteerAuthorizationPort } from '../application/volunteer-authorization-port';
import type { VolunteerRegistryGateway } from '../application/volunteer-registry-gateway';
import { VolunteerRegistryService } from '../application/volunteer-registry-service';
import { XlsxVolunteerWorkbookGateway } from '../infrastructure/xlsx-volunteer-workbook-gateway';
import { VolunteerImportPage } from './volunteer-import-page';

const authorization: VolunteerAuthorizationPort = {
  hasPermission: () => Promise.resolve(success(true)),
};

function registryGateway(
  importVolunteers: VolunteerRegistryGateway['importVolunteers'],
): VolunteerRegistryGateway {
  return {
    createVolunteer: () => Promise.reject(new Error('not used')),
    exportVolunteers: () => Promise.resolve(success([])),
    findPotentialDuplicates: () => Promise.resolve(success([])),
    getVolunteer: () => Promise.reject(new Error('not used')),
    importVolunteers,
    listVolunteers: () => Promise.reject(new Error('not used')),
    previewImportDuplicates: () => Promise.resolve(success([])),
    updateVolunteer: () => Promise.reject(new Error('not used')),
  };
}

async function validWorkbook(): Promise<ArrayBuffer> {
  return (
    await writeXlsxFile([
      ['Nombre completo', 'Correo', 'Celular'],
      ['Importada UI', 'importada@example.invalid', '+591 70000003'],
    ]).toBlob()
  ).arrayBuffer();
}

describe('VolunteerImportPage', () => {
  it('previews and confirms a valid workbook', async () => {
    const user = userEvent.setup();
    const importVolunteers = vi
      .fn<VolunteerRegistryGateway['importVolunteers']>()
      .mockResolvedValue(
        success({
          batchId: '00000000-0000-4000-8000-000000000160',
          insertedCount: 1,
        }),
      );
    const service = new VolunteerRegistryService(
      authorization,
      registryGateway(importVolunteers),
      new XlsxVolunteerWorkbookGateway(),
    );
    const i18n = await createI18n();
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <VolunteerImportPage service={service} />
        </MemoryRouter>
      </I18nextProvider>,
    );
    const buffer = await validWorkbook();
    const file = new File([buffer], 'voluntarios.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await user.upload(screen.getByLabelText('Seleccionar libro'), file);

    expect(await screen.findByText('Importada UI')).not.toBeNull();
    expect(screen.getByText('Lista')).not.toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Confirmar importación' }),
    );
    expect(
      await screen.findByText(/Se importaron 1 voluntario/u),
    ).not.toBeNull();
    expect(importVolunteers).toHaveBeenCalledWith([
      {
        acceptPotentialDuplicate: false,
        email: 'importada@example.invalid',
        fullName: 'Importada UI',
        phone: '+591 70000003',
      },
    ]);
  });

  it('rejects non-xlsx files before parsing', async () => {
    const parse = vi.spyOn(XlsxVolunteerWorkbookGateway.prototype, 'parse');
    const service = new VolunteerRegistryService(
      authorization,
      registryGateway(() =>
        Promise.resolve(
          success({
            batchId: '00000000-0000-4000-8000-000000000160',
            insertedCount: 0,
          }),
        ),
      ),
      new XlsxVolunteerWorkbookGateway(),
    );
    const i18n = await createI18n();
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <VolunteerImportPage service={service} />
        </MemoryRouter>
      </I18nextProvider>,
    );

    fireEvent.change(screen.getByLabelText('Seleccionar libro'), {
      target: {
        files: [new File(['Nombre'], 'voluntarios.csv', { type: 'text/csv' })],
      },
    });

    expect(
      await screen.findByText('Selecciona un libro .xlsx.'),
    ).not.toBeNull();
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });
});
