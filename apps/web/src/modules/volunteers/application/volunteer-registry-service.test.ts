import { describe, expect, it, vi } from 'vitest';

import { failure, success } from '@sistema-voluntariado/shared-kernel';

import type { RegisteredVolunteer } from '../domain/registered-volunteer';
import type { VolunteerAuthorizationPort } from './volunteer-authorization-port';
import type { VolunteerRegistryGateway } from './volunteer-registry-gateway';
import { VolunteerRegistryService } from './volunteer-registry-service';

const volunteer: RegisteredVolunteer = {
  createdAt: '2026-08-16T12:00:00.000Z',
  email: 'historica@example.invalid',
  fullName: 'Persona Histórica',
  id: '00000000-0000-4000-8000-000000000101',
  phone: '+591 70000000',
  updatedAt: '2026-08-16T12:00:00.000Z',
};

function authorization(allowed = true): VolunteerAuthorizationPort {
  return { hasPermission: () => Promise.resolve(success(allowed)) };
}

function gateway(
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
          offset: 0,
          total: 1,
        }),
      ),
    previewImportDuplicates: () => Promise.resolve(success([])),
    exportVolunteers: () => Promise.resolve(success([volunteer])),
    updateVolunteer: () => Promise.resolve(success(volunteer)),
    ...overrides,
  };
}

describe('VolunteerRegistryService', () => {
  it('denies operations at the application boundary', async () => {
    const listVolunteers = vi.fn<VolunteerRegistryGateway['listVolunteers']>();
    const service = new VolunteerRegistryService(
      authorization(false),
      gateway({ listVolunteers }),
    );

    const result = await service.listVolunteers();

    expect(result).toEqual({
      error: {
        code: 'forbidden',
        message: 'No tienes permiso para administrar voluntarios.',
      },
      ok: false,
    });
    expect(listVolunteers).not.toHaveBeenCalled();
  });

  it('validates pagination before consulting infrastructure', async () => {
    const hasPermission = vi.fn<VolunteerAuthorizationPort['hasPermission']>();
    const service = new VolunteerRegistryService({ hasPermission }, gateway());

    const result = await service.listVolunteers({ limit: 101 });

    expect(result.ok).toBe(false);
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it('normalizes creation input and returns a duplicate warning', async () => {
    const findPotentialDuplicates = vi
      .fn<VolunteerRegistryGateway['findPotentialDuplicates']>()
      .mockResolvedValue(
        success([
          {
            fullName: 'Registro anterior',
            id: '00000000-0000-4000-8000-000000000102',
            matchedFields: ['email'],
          },
        ]),
      );
    const createVolunteer =
      vi.fn<VolunteerRegistryGateway['createVolunteer']>();
    const service = new VolunteerRegistryService(
      authorization(),
      gateway({ createVolunteer, findPotentialDuplicates }),
    );

    const result = await service.createVolunteer({
      email: ' HISTORICA@EXAMPLE.INVALID ',
      fullName: ' Persona   Histórica ',
      phone: '',
    });

    expect(result.ok && result.value.kind).toBe('duplicate-warning');
    expect(findPotentialDuplicates).toHaveBeenCalledWith(
      {
        email: 'historica@example.invalid',
        fullName: 'Persona Histórica',
        phone: null,
      },
      null,
    );
    expect(createVolunteer).not.toHaveBeenCalled();
  });

  it('allows an explicitly confirmed historical duplicate', async () => {
    const createVolunteer = vi
      .fn<VolunteerRegistryGateway['createVolunteer']>()
      .mockResolvedValue(success(volunteer));
    const service = new VolunteerRegistryService(
      authorization(),
      gateway({
        createVolunteer,
        findPotentialDuplicates: () =>
          Promise.resolve(
            success([
              {
                fullName: 'Registro anterior',
                id: '00000000-0000-4000-8000-000000000102',
                matchedFields: ['phone'],
              },
            ]),
          ),
      }),
    );

    const result = await service.createVolunteer(
      {
        email: '',
        fullName: 'Persona Histórica',
        phone: '+591 70000000',
      },
      true,
    );

    expect(result).toEqual({
      ok: true,
      value: { kind: 'saved', volunteer },
    });
    expect(createVolunteer).toHaveBeenCalledWith({
      acceptPotentialDuplicate: true,
      email: null,
      fullName: 'Persona Histórica',
      phone: '+591 70000000',
    });
  });

  it('excludes the edited volunteer from duplicate checks', async () => {
    const findPotentialDuplicates = vi
      .fn<VolunteerRegistryGateway['findPotentialDuplicates']>()
      .mockResolvedValue(success([]));
    const service = new VolunteerRegistryService(
      authorization(),
      gateway({ findPotentialDuplicates }),
    );

    await service.updateVolunteer(volunteer.id, {
      email: volunteer.email ?? '',
      fullName: volunteer.fullName,
      phone: volunteer.phone ?? '',
    });

    expect(findPotentialDuplicates).toHaveBeenCalledWith(
      {
        email: volunteer.email,
        fullName: volunteer.fullName,
        phone: volunteer.phone,
      },
      volunteer.id,
    );
  });

  it('propagates authorization infrastructure failures safely', async () => {
    const service = new VolunteerRegistryService(
      {
        hasPermission: () =>
          Promise.resolve(
            failure({ code: 'network', message: 'Sin conexión.' }),
          ),
      },
      gateway(),
    );
    expect(await service.listVolunteers()).toEqual({
      error: { code: 'network', message: 'Sin conexión.' },
      ok: false,
    });
  });
});
