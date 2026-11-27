import writeXlsxFile from 'write-excel-file/node';

export const volunteerWorkbookHeaders = [
  'Nombre completo',
  'Correo',
  'Celular',
];

export async function createVolunteerWorkbook(
  rows: readonly (readonly (string | null)[])[],
  headers: readonly string[] = volunteerWorkbookHeaders,
) {
  const buffer = await writeXlsxFile(
    [headers, ...rows].map((row) =>
      row.map((value) => (value === null ? null : { type: String, value })),
    ),
    { sheet: 'Voluntarios' },
  ).toBuffer();

  return {
    buffer,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    name: 'padron-sintetico.xlsx',
  };
}
