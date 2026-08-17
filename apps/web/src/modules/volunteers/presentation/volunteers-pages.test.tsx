import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { VolunteerAuthorizationPort } from '../application/volunteer-authorization-port';
import type { VolunteerRegistryGateway } from '../application/volunteer-registry-gateway';
import { VolunteerRegistryService } from '../application/volunteer-registry-service';
import type { RegisteredVolunteer } from '../domain/registered-volunteer';
import { VolunteerCreatePage } from './volunteer-create-page';
import { VolunteerDetailPage } from './volunteer-detail-page';
import { VolunteerEditPage } from './volunteer-edit-page';
import { VolunteersPage } from './volunteers-page';

const volunteer: RegisteredVolunteer = {
  createdAt: '2026-08-16T12:00:00.000Z',
  email: 'persona@example.invalid',
  fullName: 'Persona Registrada',
  id: '00000000-0000-4000-8000-000000000101',
  phone: '+591 70000000',
  updatedAt: '2026-08-16T12:30:00.000Z',
};

const authorization: VolunteerAuthorizationPort = {
  hasPermission: () => Promise.resolve(success(true)),
};

function createGateway(
  overrides: Partial<VolunteerRegistryGateway> = {},
): VolunteerRegistryGateway {
  return {
    createVolunteer: () => Promise.resolve(success(volunteer)),
    findPotentialDuplicates: () => Promise.resolve(success([])),
    getVolunteer: () => Promise.resolve(success(volunteer)),
    importVolunteers: () =>
      Promise.resolve(
        success({
          batchId: '00000000-0000-4000-8000-000000000150',
          insertedCount: 1,
        }),
      ),
    listVolunteers: (query) =>
      Promise.resolve(
        success({
          items: [volunteer],
          limit: query.limit,
          offset: query.offset,
          total: 1,
        }),
      ),
    previewImportDuplicates: () => Promise.resolve(success([])),
    exportVolunteers: () => Promise.resolve(success([volunteer])),
    updateVolunteer: () => Promise.resolve(success(volunteer)),
    ...overrides,
  };
}

async function renderWithI18n(node: ReactNode) {
  const i18n = await createI18n();
  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

describe('volunteer administration pages', () => {
  it('lists, totals, searches and orders through the server service', async () => {
    const user = userEvent.setup();
    const listVolunteers = vi
      .fn<VolunteerRegistryGateway['listVolunteers']>()
      .mockImplementation((query) =>
        Promise.resolve(
          success({
            items: [volunteer],
            limit: query.limit,
            offset: query.offset,
            total: 76,
          }),
        ),
      );
    const service = new VolunteerRegistryService(
      authorization,
      createGateway({ listVolunteers }),
    );
    await renderWithI18n(
      <MemoryRouter>
        <VolunteersPage service={service} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Persona Registrada')).not.toBeNull();
    expect(screen.getByText('76 resultado(s)')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(listVolunteers).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 25,
      search: '',
      sort: 'newest',
    });
    await user.type(
      screen.getByLabelText('Buscar por nombre, correo o celular'),
      'persona',
    );
    await user.selectOptions(screen.getByLabelText('Orden'), 'name_asc');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(listVolunteers).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 0,
      search: 'persona',
      sort: 'name_asc',
    });
  });

  it('offers manual registration and Excel import in the empty state', async () => {
    const service = new VolunteerRegistryService(
      authorization,
      createGateway({
        listVolunteers: (query) =>
          Promise.resolve(
            success({
              items: [],
              limit: query.limit,
              offset: query.offset,
              total: 0,
            }),
          ),
      }),
    );
    await renderWithI18n(
      <MemoryRouter>
        <VolunteersPage service={service} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText('Todavía no hay voluntarios registrados'),
    ).not.toBeNull();
    expect(screen.getAllByText('Registrar voluntario').length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText('Importar Excel').length).toBeGreaterThan(0);
  });

  it('validates and creates a volunteer without account side effects', async () => {
    const user = userEvent.setup();
    const createVolunteer = vi
      .fn<VolunteerRegistryGateway['createVolunteer']>()
      .mockResolvedValue(success(volunteer));
    const service = new VolunteerRegistryService(
      authorization,
      createGateway({ createVolunteer }),
    );
    await renderWithI18n(
      <MemoryRouter initialEntries={['/new']}>
        <Routes>
          <Route
            element={<VolunteerCreatePage service={service} />}
            path="/new"
          />
          <Route
            element={<p>Detalle guardado</p>}
            path="/app/admin/volunteers/:id"
          />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole('button', { name: 'Guardar voluntario' }),
    );
    expect(
      await screen.findByText('Escribe un nombre de 1 a 100 caracteres.'),
    ).not.toBeNull();
    await user.type(
      screen.getByRole('textbox', { name: /Nombre completo/u }),
      'Persona Registrada',
    );
    await user.type(
      screen.getByLabelText('Correo electrónico'),
      'PERSONA@EXAMPLE.INVALID',
    );
    await user.click(
      screen.getByRole('button', { name: 'Guardar voluntario' }),
    );

    expect(await screen.findByText('Detalle guardado')).not.toBeNull();
    expect(createVolunteer).toHaveBeenCalledWith({
      acceptPotentialDuplicate: false,
      email: 'persona@example.invalid',
      fullName: 'Persona Registrada',
      phone: null,
    });
  });

  it('requires explicit confirmation before preserving a duplicate', async () => {
    const user = userEvent.setup();
    const createVolunteer = vi
      .fn<VolunteerRegistryGateway['createVolunteer']>()
      .mockResolvedValue(success(volunteer));
    const service = new VolunteerRegistryService(
      authorization,
      createGateway({
        createVolunteer,
        findPotentialDuplicates: () =>
          Promise.resolve(
            success([
              {
                fullName: 'Registro Anterior',
                id: '00000000-0000-4000-8000-000000000102',
                matchedFields: ['email'],
              },
            ]),
          ),
      }),
    );
    await renderWithI18n(
      <MemoryRouter initialEntries={['/new']}>
        <Routes>
          <Route
            element={<VolunteerCreatePage service={service} />}
            path="/new"
          />
          <Route
            element={<p>Detalle guardado</p>}
            path="/app/admin/volunteers/:id"
          />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText('Nombre completo'), 'Otro Registro');
    await user.type(
      screen.getByLabelText('Correo electrónico'),
      'persona@example.invalid',
    );
    await user.click(
      screen.getByRole('button', { name: 'Guardar voluntario' }),
    );

    expect(
      await screen.findByText('Posible duplicado detectado'),
    ).not.toBeNull();
    expect(createVolunteer).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', {
        name: 'Guardar como registro histórico separado',
      }),
    );
    expect(await screen.findByText('Detalle guardado')).not.toBeNull();
    expect(createVolunteer).toHaveBeenCalledWith(
      expect.objectContaining({ acceptPotentialDuplicate: true }),
    );
  });

  it('renders detail and loads current values for editing', async () => {
    const service = new VolunteerRegistryService(
      authorization,
      createGateway(),
    );
    const detail = await renderWithI18n(
      <MemoryRouter initialEntries={[`/volunteers/${volunteer.id}`]}>
        <Routes>
          <Route
            element={<VolunteerDetailPage service={service} />}
            path="/volunteers/:id"
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(volunteer.fullName)).not.toBeNull();
    expect(screen.getByText(volunteer.phone ?? '')).not.toBeNull();
    detail.unmount();

    await renderWithI18n(
      <MemoryRouter initialEntries={[`/volunteers/${volunteer.id}/edit`]}>
        <Routes>
          <Route
            element={<VolunteerEditPage service={service} />}
            path="/volunteers/:id/edit"
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByDisplayValue(volunteer.fullName)).not.toBeNull();
  });
});
