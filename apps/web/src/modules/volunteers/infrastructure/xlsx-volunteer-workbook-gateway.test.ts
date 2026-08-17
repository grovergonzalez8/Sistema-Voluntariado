import { describe, expect, it } from 'vitest';

import { XlsxVolunteerWorkbookGateway } from './xlsx-volunteer-workbook-gateway';

describe('XlsxVolunteerWorkbookGateway', () => {
  it('creates a reusable template with the required headers', async () => {
    const gateway = new XlsxVolunteerWorkbookGateway();
    const template = await gateway.createTemplate();
    expect(template.ok).toBe(true);
    if (!template.ok) return;

    const parsed = await gateway.parse(template.value);
    expect(parsed).toEqual({
      ok: true,
      value: [['Nombre completo', 'Correo', 'Celular']],
    });
  });

  it('exports registered volunteers as text-safe Excel rows', async () => {
    const gateway = new XlsxVolunteerWorkbookGateway();
    const exported = await gateway.createExport([
      {
        createdAt: '2026-08-16T12:00:00.000Z',
        email: 'formula@example.invalid',
        fullName: '=SUM(1,1)',
        id: '00000000-0000-4000-8000-000000000101',
        phone: '+591 070000001',
        updatedAt: '2026-08-16T12:00:00.000Z',
      },
    ]);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const parsed = await gateway.parse(exported.value);
    expect(parsed).toMatchObject({
      ok: true,
      value: [
        ['Nombre completo', 'Correo', 'Celular', 'Fecha de registro'],
        [
          '=SUM(1,1)',
          'formula@example.invalid',
          '+591 070000001',
          '2026-08-16T12:00:00.000Z',
        ],
      ],
    });
  });

  it('rejects invalid workbook bytes with a safe error', async () => {
    const gateway = new XlsxVolunteerWorkbookGateway();
    const result = await gateway.parse(new Uint8Array([1, 2, 3]).buffer);
    expect(result).toMatchObject({ error: { code: 'validation' }, ok: false });
  });
});
