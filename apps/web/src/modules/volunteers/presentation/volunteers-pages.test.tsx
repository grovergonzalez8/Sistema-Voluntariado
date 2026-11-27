import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { StrictMode, type ReactNode } from 'react';
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { VolunteerAuthorizationPort } from '../application/volunteer-authorization-port';
import type {
  VolunteerRegistryGateway,
  VolunteerPage,
} from '../application/volunteer-registry-gateway';
import { VolunteerRegistryService } from '../application/volunteer-registry-service';
import type { RegisteredVolunteer } from '../domain/registered-volunteer';
import type { VolunteerDuplicateMatch } from '../domain/volunteer-duplicates';
import { VolunteerCreatePage } from './volunteer-create-page';
import { VolunteerDetailPage } from './volunteer-detail-page';
import { VolunteerEditPage } from './volunteer-edit-page';
import { VolunteersPage } from './volunteers-page';
import * as downloads from './download-xlsx';

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

const initialListPage: VolunteerPage = {
  items: [volunteer],
  limit: 25,
  offset: 0,
  total: 60,
};

function pendingListPage() {
  let resolvePage: ((value: Result<VolunteerPage>) => void) | undefined;
  let rejectPage: ((reason: Error) => void) | undefined;
  const promise = new Promise<Result<VolunteerPage>>((resolve, reject) => {
    resolvePage = resolve;
    rejectPage = reject;
  });
  return {
    promise,
    resolve(value: Result<VolunteerPage>) {
      if (!resolvePage) throw new Error('Missing list resolver');
      resolvePage(value);
    },
    reject(reason: Error) {
      if (!rejectPage) throw new Error('Missing list rejecter');
      rejectPage(reason);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderWithI18n(node: ReactNode) {
  const i18n = await createI18n();
  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

async function renderVolunteerList(
  gateway: VolunteerRegistryGateway,
  strictMode = false,
) {
  const service = new VolunteerRegistryService(authorization, gateway);
  const content = (
    <MemoryRouter>
      <VolunteersPage service={service} />
    </MemoryRouter>
  );
  const view = await renderWithI18n(
    strictMode ? <StrictMode>{content}</StrictMode> : content,
  );
  return { ...view, service };
}

const otherResourceId = '00000000-0000-4000-8000-000000000199';
const otherResource = {
  ...volunteer,
  id: otherResourceId,
  fullName: 'Entidad B',
  email: 'b@example.invalid',
  phone: '+591 71111111',
};

function pendingResource<T>() {
  let resolveResult: ((value: Result<T>) => void) | undefined;
  let rejectResult: ((error: Error) => void) | undefined;
  const promise = new Promise<Result<T>>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  return {
    promise,
    resolve(value: Result<T>) {
      if (!resolveResult) throw new Error('Missing resolver');
      resolveResult(value);
    },
    reject(error: Error) {
      if (!rejectResult) throw new Error('Missing rejecter');
      rejectResult(error);
    },
  };
}

function ResourceNavigation({ mode }: { readonly mode: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <nav aria-label="Navegación de prueba">
      <Link to={`/resources/${volunteer.id}/${mode}`}>Recurso A</Link>
      <Link to={`/resources/${otherResourceId}/${mode}`}>Recurso B</Link>
      <button
        onClick={() => {
          void navigate(-1);
        }}
      >
        Atrás de prueba
      </button>
      <button
        onClick={() => {
          void navigate(1);
        }}
      >
        Adelante de prueba
      </button>
      <output aria-label="Ruta actual">{location.pathname}</output>
    </nav>
  );
}

async function renderResourcePage(
  mode: 'edit' | 'detail',
  overrides: Partial<VolunteerRegistryGateway> = {},
  strictMode = false,
) {
  const gateway = createGateway({
    getVolunteer: (id) =>
      Promise.resolve(
        success(id === otherResourceId ? otherResource : volunteer),
      ),
    updateVolunteer: (input) =>
      Promise.resolve(success({ ...volunteer, ...input })),
    ...overrides,
  });
  const service = new VolunteerRegistryService(authorization, gateway);
  const content = (
    <MemoryRouter initialEntries={[`/resources/${volunteer.id}/${mode}`]}>
      <ResourceNavigation mode={mode} />
      <Routes>
        <Route
          path={`/resources/:id/${mode}`}
          element={
            mode === 'edit' ? (
              <VolunteerEditPage service={service} />
            ) : (
              <VolunteerDetailPage service={service} />
            )
          }
        />
        <Route path="*" element={<p>Destino de guardado</p>} />
      </Routes>
    </MemoryRouter>
  );
  return renderWithI18n(
    strictMode ? <StrictMode>{content}</StrictMode> : content,
  );
}

describe('volunteer administration pages', () => {
  it('confirms only B duplicate evidence and blocks duplicate confirmation submits', async () => {
    const user = userEvent.setup();
    const pending = pendingResource<RegisteredVolunteer>();
    const update = vi
      .fn<VolunteerRegistryGateway['updateVolunteer']>()
      .mockReturnValue(pending.promise);
    await renderResourcePage('edit', {
      updateVolunteer: update,
      findPotentialDuplicates: () =>
        Promise.resolve(
          success([
            {
              id: '00000000-0000-4000-8000-000000000777',
              fullName: 'Coincidencia B',
              matchedFields: ['email'],
            },
          ]),
        ),
    });
    await screen.findByText(volunteer.fullName);
    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Borrador A' },
    });
    await user.click(screen.getByRole('link', { name: 'Recurso B' }));
    await screen.findByText(otherResource.fullName);
    await user.click(
      screen.getByRole('button', { name: 'Guardar voluntario' }),
    );
    await screen.findByText(/Coincidencia B/);
    const confirm = screen.getByRole('button', {
      name: 'Guardar como registro histórico separado',
    });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    await waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    expect(update).toHaveBeenCalledWith({
      id: otherResourceId,
      fullName: otherResource.fullName,
      email: otherResource.email,
      phone: otherResource.phone,
      acceptPotentialDuplicate: true,
    });
    await act(async () => {
      pending.resolve(success(otherResource));
      await pending.promise;
    });
    await screen.findByText('Destino de guardado');
  });

  it.each(['edit', 'detail'] as const)(
    'refuses a mismatched %s resource response without exposing old data',
    async (mode) => {
      await renderResourcePage(mode, {
        getVolunteer: () => Promise.resolve(success(otherResource)),
      });
      await screen.findByRole('alert');
      expect(screen.queryByText(otherResource.fullName)).toBeNull();
      expect(screen.queryByDisplayValue(otherResource.fullName)).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Guardar voluntario' }),
      ).toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
    },
  );

  it('does not navigate on a mismatched edit response', async () => {
    const user = userEvent.setup();
    const update = vi
      .fn<VolunteerRegistryGateway['updateVolunteer']>()
      .mockResolvedValue(success(otherResource));
    await renderResourcePage('edit', { updateVolunteer: update });
    await screen.findByText(volunteer.fullName);
    await user.click(
      screen.getByRole('button', { name: 'Guardar voluntario' }),
    );
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Ruta actual').textContent).toBe(
      `/resources/${volunteer.id}/edit`,
    );
    expect(screen.queryByText('Destino de guardado')).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Guardar voluntario',
      }).disabled,
    ).toBe(false);
  });

  it('ends a rejected save and retries the current resource without leaking details', async () => {
    const user = userEvent.setup();
    const update = vi
      .fn<VolunteerRegistryGateway['updateVolunteer']>()
      .mockRejectedValueOnce(new Error('Detalle privado de guardado'))
      .mockResolvedValue(success(volunteer));
    await renderResourcePage('edit', { updateVolunteer: update });
    await screen.findByText(volunteer.fullName);
    await user.click(
      screen.getByRole('button', { name: 'Guardar voluntario' }),
    );
    await screen.findByRole('alert');
    expect(screen.queryByText('Detalle privado de guardado')).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Guardar voluntario',
      }).disabled,
    ).toBe(false);
    await user.click(
      screen.getByRole('button', { name: 'Guardar voluntario' }),
    );
    await screen.findByText('Destino de guardado');
    expect(update).toHaveBeenCalledTimes(2);
  });

  it.each(['edit', 'detail'] as const)(
    'supports successful %s A-B-A navigation and browser history in StrictMode',
    async (mode) => {
      const user = userEvent.setup();
      await renderResourcePage(mode, {}, true);
      await screen.findByText(volunteer.fullName);
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText(otherResource.fullName);
      await user.click(screen.getByRole('button', { name: 'Atrás de prueba' }));
      await screen.findByText(volunteer.fullName);
      await user.click(
        screen.getByRole('button', { name: 'Adelante de prueba' }),
      );
      await screen.findByText(otherResource.fullName);
      expect(screen.queryByText(volunteer.fullName)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it.each([
    ['edit', 'failure'],
    ['edit', 'rejection'],
    ['detail', 'failure'],
    ['detail', 'rejection'],
  ] as const)(
    'isolates %s load %s and recovers the requested resource',
    async (mode, outcome) => {
      const user = userEvent.setup();
      const pending = pendingResource<RegisteredVolunteer>();

      let failed = false;
      const read = vi
        .fn<VolunteerRegistryGateway['getVolunteer']>()
        .mockImplementation((id) => {
          if (id === otherResourceId && !failed) {
            failed = true;
            return pending.promise;
          }
          return Promise.resolve(
            success(id === otherResourceId ? otherResource : volunteer),
          );
        });
      await renderResourcePage(mode, {
        getVolunteer: read,
      });
      await screen.findByText(volunteer.fullName);
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await act(async () => {
        const request = pending;
        if (outcome === 'rejection') {
          request.reject(new Error('Detalle privado simulado'));
          await request.promise.catch(() => undefined);
        } else {
          request.resolve(
            failure({ code: 'forbidden', message: 'Carga denegada' }),
          );
          await request.promise;
        }
      });
      await screen.findByRole('alert');
      expect(screen.queryByText(volunteer.fullName)).toBeNull();
      expect(screen.queryByDisplayValue(volunteer.fullName)).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Guardar voluntario' }),
      ).toBeNull();
      expect(screen.queryByText('Detalle privado simulado')).toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      await screen.findByText(otherResource.fullName);
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it.each([
    ['edit', 'success'],
    ['edit', 'failure'],
    ['edit', 'rejection'],
    ['detail', 'success'],
    ['detail', 'failure'],
    ['detail', 'rejection'],
  ] as const)(
    'ignores a late %s read with %s after B and a new A instance',
    async (mode, outcome) => {
      const user = userEvent.setup();
      const pending = pendingResource<RegisteredVolunteer>();

      let firstA = true;
      const read = vi
        .fn<VolunteerRegistryGateway['getVolunteer']>()
        .mockImplementation((id) => {
          if (id === volunteer.id && firstA) {
            firstA = false;
            return pending.promise;
          }
          return Promise.resolve(
            success(id === otherResourceId ? otherResource : volunteer),
          );
        });

      await renderResourcePage(mode, { getVolunteer: read });
      await waitFor(() => {
        expect(read).toHaveBeenCalledOnce();
      });
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText(otherResource.fullName);
      await user.click(screen.getByRole('button', { name: 'Atrás de prueba' }));
      await screen.findByText(volunteer.fullName);
      await act(async () => {
        if (outcome === 'rejection') {
          const request = pending;
          request.reject(new Error('Rechazo antiguo'));
          await request.promise.catch(() => undefined);
        } else {
          pending.resolve(
            outcome === 'success'
              ? success({ ...volunteer, fullName: 'Respuesta antigua' })
              : failure({ code: 'network', message: 'Error antiguo' }),
          );
          await pending.promise;
        }
      });
      expect(screen.getByText(volunteer.fullName)).not.toBeNull();
      expect(screen.queryByText('Respuesta antigua')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('saves B with only its own fields after leaving a dirty A form and blocks duplicate submit', async () => {
    const user = userEvent.setup();
    const pending = pendingResource<RegisteredVolunteer>();
    const update = vi
      .fn<VolunteerRegistryGateway['updateVolunteer']>()
      .mockReturnValue(pending.promise);
    await renderResourcePage('edit', { updateVolunteer: update });
    await screen.findByText(volunteer.fullName);
    fireEvent.change(screen.getByLabelText('Nombre completo'), {
      target: { value: 'Borrador A' },
    });
    await user.click(screen.getByRole('link', { name: 'Recurso B' }));
    await screen.findByText(otherResource.fullName);
    expect(
      screen.getByLabelText<HTMLInputElement>('Nombre completo').value,
    ).toBe(otherResource.fullName);
    expect(
      screen.getByLabelText<HTMLInputElement>('Correo electrónico').value,
    ).toBe(otherResource.email);
    expect(
      screen.getByLabelText<HTMLInputElement>('Número de celular').value,
    ).toBe(otherResource.phone);
    const form = screen.getByLabelText('Nombre completo').closest('form');
    if (!form) throw new Error('Missing edit form');
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    expect(update).toHaveBeenCalledWith({
      id: otherResourceId,
      fullName: otherResource.fullName,
      email: otherResource.email,
      phone: otherResource.phone,
      acceptPotentialDuplicate: false,
    });
    await act(async () => {
      pending.resolve(success(otherResource));
      await pending.promise;
    });
    expect(await screen.findByText('Destino de guardado')).not.toBeNull();
  });

  it.each([
    ['success', false],
    ['success', true],
    ['failure', false],
    ['failure', true],
    ['rejection', false],
    ['rejection', true],
    ['duplicate', false],
    ['duplicate', true],
  ] as const)(
    'isolates a pending edit %s across navigation (return to A: %s)',
    async (outcome, returnToA) => {
      const user = userEvent.setup();
      const previous = pendingResource<RegisteredVolunteer>();
      const current = pendingResource<RegisteredVolunteer>();
      const duplicates = pendingResource<readonly VolunteerDuplicateMatch[]>();
      const update = vi
        .fn<VolunteerRegistryGateway['updateVolunteer']>()
        .mockReturnValueOnce(
          outcome === 'duplicate' ? current.promise : previous.promise,
        )
        .mockReturnValue(current.promise);
      let duplicateReads = 0;
      await renderResourcePage('edit', {
        updateVolunteer: update,
        findPotentialDuplicates: () => {
          duplicateReads += 1;
          return duplicateReads === 1 && outcome === 'duplicate'
            ? duplicates.promise
            : Promise.resolve(success([]));
        },
      });
      await screen.findByText(volunteer.fullName);
      await user.click(
        screen.getByRole('button', { name: 'Guardar voluntario' }),
      );
      await waitFor(() => {
        expect(
          outcome === 'duplicate' ? duplicateReads : update.mock.calls.length,
        ).toBe(1);
      });
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText(otherResource.fullName);
      if (returnToA) {
        await user.click(
          screen.getByRole('button', { name: 'Atrás de prueba' }),
        );
        await screen.findByText(volunteer.fullName);
      }
      fireEvent.change(screen.getByLabelText('Nombre completo'), {
        target: { value: 'Edición vigente' },
      });
      await user.click(
        screen.getByRole('button', { name: 'Guardar voluntario' }),
      );
      await waitFor(() => {
        expect(update).toHaveBeenCalledTimes(outcome === 'duplicate' ? 1 : 2);
      });
      await act(async () => {
        if (outcome === 'duplicate') {
          duplicates.resolve(
            success([
              {
                id: '00000000-0000-4000-8000-000000000777',
                fullName: 'Duplicado antiguo',
                matchedFields: ['email'],
              },
            ]),
          );
          await duplicates.promise;
        } else if (outcome === 'rejection') {
          previous.reject(new Error('Rechazo antiguo'));
          await previous.promise.catch(() => undefined);
        } else {
          previous.resolve(
            outcome === 'success'
              ? success(volunteer)
              : failure({ code: 'network', message: 'Error antiguo' }),
          );
          await previous.promise;
        }
      });
      expect(
        screen.getByLabelText<HTMLInputElement>('Nombre completo').value,
      ).toBe('Edición vigente');
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Guardando…' })
          .disabled,
      ).toBe(true);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Duplicado antiguo')).toBeNull();
      expect(screen.getByLabelText('Ruta actual').textContent).toBe(
        `/resources/${returnToA ? volunteer.id : otherResourceId}/edit`,
      );
      const latest = update.mock.calls.at(-1)?.[0];
      expect(latest).toMatchObject({
        id: returnToA ? volunteer.id : otherResourceId,
        fullName: 'Edición vigente',
      });
      await act(async () => {
        current.resolve(
          success({
            ...(returnToA ? volunteer : otherResource),
            fullName: 'Edición vigente',
          }),
        );
        await current.promise;
      });
      expect(await screen.findByText('Destino de guardado')).not.toBeNull();
    },
  );

  it.each(['edit', 'detail'] as const)(
    'isolates %s while the next route resource is loading',
    async (mode) => {
      const user = userEvent.setup();
      const pending = pendingResource<RegisteredVolunteer>();
      await renderResourcePage(mode, {
        getVolunteer: (id) =>
          id === otherResourceId
            ? pending.promise
            : Promise.resolve(success(volunteer)),
      });
      await screen.findByText(volunteer.fullName);
      if (mode === 'edit') {
        fireEvent.change(screen.getByLabelText('Nombre completo'), {
          target: { value: 'Borrador exclusivo A' },
        });
      }
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      expect(screen.queryByText(volunteer.fullName)).toBeNull();
      expect(screen.queryByDisplayValue('Borrador exclusivo A')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Guardar voluntario' }),
      ).toBeNull();
      expect(screen.getByText('Cargando…')).not.toBeNull();
      await act(async () => {
        pending.resolve(success(otherResource));

        await pending.promise;
      });
      expect(await screen.findByText(otherResource.fullName)).not.toBeNull();
    },
  );

  it('resets the page on sort, keeps the applied search and ignores an older page response', async () => {
    const user = userEvent.setup();
    const previousPage = pendingListPage();
    const currentSort = pendingListPage();
    const listVolunteers = vi
      .fn<VolunteerRegistryGateway['listVolunteers']>()
      .mockResolvedValueOnce(success(initialListPage))
      .mockResolvedValueOnce(success(initialListPage))
      .mockReturnValueOnce(previousPage.promise)
      .mockReturnValueOnce(currentSort.promise)
      .mockResolvedValue(success(initialListPage));
    await renderVolunteerList(createGateway({ listVolunteers }));
    await screen.findByText(volunteer.fullName);
    const input = screen.getByLabelText('Buscar por nombre, correo o celular');
    await user.type(input, 'Persona');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText(volunteer.fullName);
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => {
      expect(listVolunteers).toHaveBeenCalledTimes(3);
    });
    await user.clear(input);
    await user.type(input, 'Borrador sin aplicar');
    await user.selectOptions(screen.getByLabelText('Orden'), 'name_asc');
    await waitFor(() => {
      expect(listVolunteers).toHaveBeenCalledTimes(4);
    });
    expect(listVolunteers).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 0,
      search: 'Persona',
      sort: 'name_asc',
    });
    await act(async () => {
      currentSort.resolve(
        success({
          ...initialListPage,
          items: [{ ...volunteer, fullName: 'Orden vigente' }],
        }),
      );
      await currentSort.promise;
    });
    await act(async () => {
      previousPage.resolve(
        success({
          ...initialListPage,
          offset: 25,
          total: 99,
          items: [{ ...volunteer, fullName: 'Página anterior' }],
        }),
      );
      await previousPage.promise;
    });
    expect(screen.getByText('Orden vigente')).not.toBeNull();
    expect(screen.queryByText('Página anterior')).toBeNull();
    expect(screen.getByText('Página 1 de 3')).not.toBeNull();
    expect(screen.queryByText('Cargando…')).toBeNull();
    await user.clear(input);
    await user.type(input, '  Persona  ');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText(volunteer.fullName);
    expect(listVolunteers).toHaveBeenCalledTimes(5);
    expect(listVolunteers).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 0,
      search: 'Persona',
      sort: 'name_asc',
    });
  });

  it('does not start an unresolved loading state for an unchanged sort', async () => {
    const listVolunteers = vi
      .fn<VolunteerRegistryGateway['listVolunteers']>()
      .mockResolvedValue(success(initialListPage));
    await renderVolunteerList(createGateway({ listVolunteers }));
    await screen.findByText(volunteer.fullName);
    fireEvent.change(screen.getByLabelText('Orden'), {
      target: { value: 'newest' },
    });
    expect(listVolunteers).toHaveBeenCalledOnce();
    expect(screen.queryByText('Cargando…')).toBeNull();
    expect(screen.getByText(volunteer.fullName)).not.toBeNull();
  });

  it('keeps navigation and export bound to applied search and sort', async () => {
    const user = userEvent.setup();
    const buffer = new ArrayBuffer(0);
    const download = vi
      .spyOn(downloads, 'downloadXlsx')
      .mockImplementation(() => undefined);
    const { service } = await renderVolunteerList(createGateway());
    const createExport = vi
      .spyOn(service, 'createExport')
      .mockResolvedValue(success(buffer));
    await screen.findByText(volunteer.fullName);
    const input = screen.getByLabelText('Buscar por nombre, correo o celular');
    await user.type(input, 'Persona');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText(volunteer.fullName);
    await user.selectOptions(screen.getByLabelText('Orden'), 'name_asc');
    await screen.findByText(volunteer.fullName);
    await user.clear(input);
    await user.type(input, 'Sin enviar');
    await user.click(
      screen.getByRole('button', { name: 'Exportar resultados actuales' }),
    );
    await waitFor(() => {
      expect(download).toHaveBeenCalledExactlyOnceWith(
        buffer,
        'voluntarios.xlsx',
      );
    });
    expect(createExport).toHaveBeenCalledExactlyOnceWith({
      search: 'Persona',
      sort: 'name_asc',
    });
    expect(
      screen
        .getByRole('link', { name: 'Registrar voluntario' })
        .getAttribute('href'),
    ).toBe('/app/admin/volunteers/new');
    expect(
      screen.getByRole('link', { name: 'Importar Excel' }).getAttribute('href'),
    ).toBe('/app/admin/volunteers/import');
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('coalesces identical pending searches and finishes the original request', async () => {
    const user = userEvent.setup();
    const pending = pendingListPage();
    const list = vi
      .fn<VolunteerRegistryGateway['listVolunteers']>()
      .mockReturnValue(pending.promise);
    await renderVolunteerList(createGateway({ listVolunteers: list }));
    await waitFor(() => {
      expect(list).toHaveBeenCalledOnce();
    });
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    fireEvent.change(
      screen.getByLabelText('Buscar por nombre, correo o celular'),
      { target: { value: '   ' } },
    );
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(list).toHaveBeenCalledOnce();
    expect(screen.getByText('Cargando…')).not.toBeNull();
    await act(async () => {
      pending.resolve(success(initialListPage));
      await pending.promise;
    });
    expect(await screen.findByText(volunteer.fullName)).not.toBeNull();
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it('searches from page two with one offset-zero request and preserves filters when paging', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn<VolunteerRegistryGateway['listVolunteers']>()
      .mockImplementation((query) =>
        Promise.resolve(success({ ...initialListPage, offset: query.offset })),
      );
    await renderVolunteerList(createGateway({ listVolunteers: list }));
    await screen.findByText(volunteer.fullName);
    await user.type(
      screen.getByLabelText('Buscar por nombre, correo o celular'),
      '  vigente  ',
    );
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText(volunteer.fullName);
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Página 2 de 3');
    expect(list).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 25,
      search: 'vigente',
      sort: 'newest',
    });
    const before = list.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Página 1 de 3');
    expect(list).toHaveBeenCalledTimes(before + 1);
    expect(list).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 0,
      search: 'vigente',
      sort: 'newest',
    });
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Página 2 de 3');
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    await screen.findByText('Página 1 de 3');
    expect(list).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 0,
      search: 'vigente',
      sort: 'newest',
    });
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it.each([
    ['success', 'old-first'],
    ['failure', 'old-first'],
    ['rejection', 'old-first'],
    ['success', 'new-first'],
    ['failure', 'new-first'],
    ['rejection', 'new-first'],
  ] as const)(
    'ignores old %s results in %s order, including loading and totals',
    async (outcome, order) => {
      const user = userEvent.setup();
      const previous = pendingListPage();
      const current = pendingListPage();
      const list = vi
        .fn<VolunteerRegistryGateway['listVolunteers']>()
        .mockReturnValueOnce(previous.promise)
        .mockReturnValueOnce(current.promise);
      await renderVolunteerList(createGateway({ listVolunteers: list }));
      await waitFor(() => {
        expect(list).toHaveBeenCalledOnce();
      });
      await user.type(
        screen.getByLabelText('Buscar por nombre, correo o celular'),
        'vigente',
      );
      await user.click(screen.getByRole('button', { name: 'Buscar' }));
      await waitFor(() => {
        expect(list).toHaveBeenCalledTimes(2);
      });
      expect(list).toHaveBeenLastCalledWith({
        limit: 25,
        offset: 0,
        search: 'vigente',
        sort: 'newest',
      });
      const finishCurrent = async () => {
        await act(async () => {
          current.resolve(
            success({
              ...initialListPage,
              items: [{ ...volunteer, fullName: 'Resultado vigente' }],
              total: 2,
            }),
          );
          await current.promise;
        });
      };
      const finishPrevious = async () => {
        await act(async () => {
          if (outcome === 'rejection') {
            previous.reject(new Error('Detalle antiguo simulado'));
            await previous.promise.catch(() => undefined);
          } else {
            previous.resolve(
              outcome === 'success'
                ? success({
                    ...initialListPage,
                    items: [{ ...volunteer, fullName: 'Resultado anterior' }],
                    total: 99,
                  })
                : failure({ code: 'network', message: 'Error anterior' }),
            );
            await previous.promise;
          }
        });
      };
      if (order === 'new-first') {
        await finishCurrent();
        await finishPrevious();
      } else {
        await finishPrevious();
        expect(screen.getByText('Cargando…')).not.toBeNull();
        expect(screen.queryByText('Resultado anterior')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
        await finishCurrent();
      }
      expect(await screen.findByText('Resultado vigente')).not.toBeNull();
      expect(screen.getByText('2 resultado(s)')).not.toBeNull();
      expect(screen.getByText('Página 1 de 1')).not.toBeNull();
      expect(screen.queryByText('Resultado anterior')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
    },
  );

  it.each(['failure', 'rejection'] as const)(
    'finishes a current %s and recovers with the same search',
    async (outcome) => {
      const user = userEvent.setup();
      const pending = pendingListPage();
      const list = vi
        .fn<VolunteerRegistryGateway['listVolunteers']>()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValue(success(initialListPage));
      await renderVolunteerList(createGateway({ listVolunteers: list }));
      await waitFor(() => {
        expect(list).toHaveBeenCalledOnce();
      });
      await act(async () => {
        if (outcome === 'rejection') {
          pending.reject(new Error('Detalle interno simulado'));
          await pending.promise.catch(() => undefined);
        } else {
          pending.resolve(
            failure({ code: 'network', message: 'Error recuperable' }),
          );
          await pending.promise;
        }
      });
      expect(await screen.findByRole('alert')).not.toBeNull();
      expect(screen.getByRole('alert').textContent).toBe(
        outcome === 'rejection'
          ? 'No fue posible cargar los voluntarios. Reintenta la búsqueda.'
          : 'Error recuperable',
      );
      expect(screen.queryByText('Detalle interno simulado')).toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Buscar' }));
      expect(await screen.findByText(volunteer.fullName)).not.toBeNull();
      expect(list).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
    },
  );

  it('ignores a rejected request after unmount', async () => {
    const pending = pendingListPage();
    const list = vi
      .fn<VolunteerRegistryGateway['listVolunteers']>()
      .mockReturnValue(pending.promise);
    const view = await renderVolunteerList(
      createGateway({ listVolunteers: list }),
    );
    await waitFor(() => {
      expect(list).toHaveBeenCalledOnce();
    });
    view.unmount();
    await act(async () => {
      pending.reject(new Error('Rechazo después de desmontaje'));
      await pending.promise.catch(() => undefined);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Cargando…')).toBeNull();
    expect(list).toHaveBeenCalledOnce();
  });

  it('refreshes identical searches under StrictMode without an effect loop', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn<VolunteerRegistryGateway['listVolunteers']>()
      .mockResolvedValue(success(initialListPage));
    await renderVolunteerList(createGateway({ listVolunteers: list }), true);
    await screen.findByText(volunteer.fullName);
    const before = list.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => {
      expect(list).toHaveBeenCalledTimes(before + 1);
    });
    expect(await screen.findByText(volunteer.fullName)).not.toBeNull();
    expect(screen.queryByText('Cargando…')).toBeNull();
  });

  it.each([
    { applied: '', submitted: '' },
    { applied: '', submitted: '   ' },
    { applied: 'Persona', submitted: 'Persona' },
    { applied: 'Persona', submitted: '  Persona  ' },
  ])(
    'refreshes a settled volunteer search $applied with $submitted and finishes loading',
    async ({ applied, submitted }) => {
      const user = userEvent.setup();
      const listVolunteers = vi
        .fn<VolunteerRegistryGateway['listVolunteers']>()
        .mockImplementation((query) =>
          Promise.resolve(
            success({
              items: [volunteer],
              limit: query.limit,
              offset: query.offset,
              total: 1,
            }),
          ),
        );
      await renderVolunteerList(createGateway({ listVolunteers }));
      await screen.findByText(volunteer.fullName);
      const input = screen.getByLabelText(
        'Buscar por nombre, correo o celular',
      );
      if (applied) {
        await user.type(input, applied);
        await user.click(screen.getByRole('button', { name: 'Buscar' }));
        await waitFor(() => {
          expect(listVolunteers).toHaveBeenCalledTimes(2);
        });
        await screen.findByText(volunteer.fullName);
      }
      await user.clear(input);
      if (submitted) await user.type(input, submitted);
      const previousCalls = listVolunteers.mock.calls.length;
      await user.click(screen.getByRole('button', { name: 'Buscar' }));
      await waitFor(() => {
        expect(listVolunteers).toHaveBeenCalledTimes(previousCalls + 1);
      });
      expect(listVolunteers).toHaveBeenLastCalledWith({
        limit: 25,
        offset: 0,
        search: submitted.trim(),
        sort: 'newest',
      });
      expect(await screen.findByText(volunteer.fullName)).not.toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
      expect(
        screen.getByRole('link', { name: 'Ver detalle' }).getAttribute('href'),
      ).toBe(`/app/admin/volunteers/${volunteer.id}`);
    },
  );

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
