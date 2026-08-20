import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import writeXlsxFile, { type SheetData } from 'write-excel-file/universal';

import { XlsxVolunteerWorkbookGateway } from './xlsx-volunteer-workbook-gateway';

const spreadsheetNamespace =
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const officeRelationshipNamespace =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationshipNamespace =
  'http://schemas.openxmlformats.org/package/2006/relationships';

function minimalWorkbookXml(): string {
  return `<workbook xmlns="${spreadsheetNamespace}" xmlns:r="${officeRelationshipNamespace}"><sheets><sheet name="Voluntarios" r:id="rId1"/></sheets></workbook>`;
}

function minimalRelationshipsXml(target = 'worksheets/sheet1.xml'): string {
  return `<Relationships xmlns="${packageRelationshipNamespace}"><Relationship Id="rId1" Type="${officeRelationshipNamespace}/worksheet" Target="${target}"/></Relationships>`;
}

function minimalWorksheetXml(content = '<sheetData/>'): string {
  return `<worksheet xmlns="${spreadsheetNamespace}">${content}</worksheet>`;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function replaceCentralDirectoryOriginalSize(
  archive: Uint8Array,
  entryName: string,
  originalSize: number,
): Uint8Array {
  const result = archive.slice();
  const view = new DataView(
    result.buffer,
    result.byteOffset,
    result.byteLength,
  );
  for (let offset = 0; offset <= result.byteLength - 46; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const fileNameLength = view.getUint16(offset + 28, true);
    const name = strFromU8(
      result.subarray(offset + 46, offset + 46 + fileNameLength),
    );
    if (name === entryName) {
      view.setUint32(offset + 24, originalSize, true);
      return result;
    }
  }
  throw new Error(`ZIP entry not found: ${entryName}`);
}

async function createWorkbook(
  sheets: readonly SheetData[],
): Promise<ArrayBuffer> {
  const blob = await writeXlsxFile(
    sheets.map((data, index) => ({ data, sheet: `Hoja ${String(index + 1)}` })),
  ).toBlob();
  return blob.arrayBuffer();
}

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

    const entries = unzipSync(new Uint8Array(template.value));
    const styles = entries['xl/styles.xml'];
    const worksheet = entries['xl/worksheets/sheet1.xml'];
    expect(styles).toBeDefined();
    expect(worksheet).toBeDefined();
    if (!styles || !worksheet) return;
    expect(strFromU8(styles)).toContain('formatCode="@"');
    expect(
      strFromU8(worksheet).match(/<c r="C[0-9]+" s="[0-9]+"\/>/g),
    ).toHaveLength(1000);
  });

  it('exports registered volunteers as text-safe Excel rows', async () => {
    const gateway = new XlsxVolunteerWorkbookGateway();
    const formulaPrefixes = ['=SUM(1,1)', '+SUM(1,1)', '-1+1', '@SUM(1,1)'];
    const exported = await gateway.createExport(
      formulaPrefixes.map((fullName, index) => ({
        createdAt: '2026-08-16T12:00:00.000Z',
        email: fullName,
        fullName,
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        phone: fullName,
        updatedAt: '2026-08-16T12:00:00.000Z',
      })),
    );
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const parsed = await gateway.parse(exported.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.slice(1).map((row) => row[0])).toEqual(formulaPrefixes);
    expect(parsed.value.slice(1).map((row) => row[1])).toEqual(formulaPrefixes);
    expect(parsed.value.slice(1).map((row) => row[2])).toEqual(formulaPrefixes);
    const entries = unzipSync(new Uint8Array(exported.value));
    const worksheet = entries['xl/worksheets/sheet1.xml'];
    expect(worksheet).toBeDefined();
    if (worksheet) expect(strFromU8(worksheet)).not.toContain('<f');
  });

  it('preserves plus signs and leading zeroes in text phone cells', async () => {
    const gateway = new XlsxVolunteerWorkbookGateway();
    const workbook = await createWorkbook([
      [
        ['Nombre completo', 'Correo', 'Celular'],
        ['Con prefijo', null, '+591 070000001'],
        ['Con cero', null, '070000002'],
      ],
    ]);

    await expect(gateway.parse(workbook)).resolves.toMatchObject({
      ok: true,
      value: [
        ['Nombre completo', 'Correo', 'Celular'],
        ['Con prefijo', null, '+591 070000001'],
        ['Con cero', null, '070000002'],
      ],
    });
  });

  it('rejects every workbook with additional worksheets, even when empty', async () => {
    const gateway = new XlsxVolunteerWorkbookGateway();
    const header: SheetData = [['Nombre completo', 'Correo', 'Celular']];
    const twoDataSheets = await createWorkbook([
      [...header, ['Primera', null, null]],
      [...header, ['Segunda', null, null]],
    ]);
    const secondEmpty = await createWorkbook([header, []]);
    const threeSheets = await createWorkbook([header, [], []]);
    const prefixedEntries = unzipSync(
      new Uint8Array(await createWorkbook([header])),
    );
    const prefixedWorkbook = prefixedEntries['xl/workbook.xml'];
    expect(prefixedWorkbook).toBeDefined();
    if (!prefixedWorkbook) return;
    prefixedEntries['xl/workbook.xml'] = strToU8(
      strFromU8(prefixedWorkbook)
        .replace('<workbook ', `<workbook xmlns:x="${spreadsheetNamespace}" `)
        .replace(
          '</sheets>',
          '<x:sheet name="Oculta" sheetId="2" r:id="rId2"/></sheets>',
        ),
    );
    const prefixedSecondSheet = exactArrayBuffer(zipSync(prefixedEntries));

    for (const workbook of [
      twoDataSheets,
      secondEmpty,
      threeSheets,
      prefixedSecondSheet,
    ]) {
      const result = await gateway.parse(workbook);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe('validation');
      expect(result.error.message).toContain('una sola hoja');
    }
  });

  it('parses 1,000 real rows and rejects a worksheet beyond the row boundary', async () => {
    const gateway = new XlsxVolunteerWorkbookGateway();
    const header = ['Nombre completo', 'Correo', 'Celular'];
    const rows: SheetData = Array.from({ length: 1001 }, (_, index) => [
      `Persona ${String(index)}`,
      null,
      null,
    ]);
    const accepted = await createWorkbook([[header, ...rows.slice(0, 1000)]]);
    const rejected = await createWorkbook([[header, ...rows]]);
    const singleQuotedEntries = unzipSync(new Uint8Array(rejected));
    const singleQuotedWorksheet =
      singleQuotedEntries['xl/worksheets/sheet1.xml'];
    expect(singleQuotedWorksheet).toBeDefined();
    if (!singleQuotedWorksheet) return;
    singleQuotedEntries['xl/worksheets/sheet1.xml'] = strToU8(
      strFromU8(singleQuotedWorksheet)
        .replace('<worksheet ', `<worksheet xmlns:x="${spreadsheetNamespace}" `)
        .replaceAll('<row', '<x:row')
        .replaceAll('</row', '</x:row')
        .replaceAll('<c ', '<x:c ')
        .replaceAll('</c>', '</x:c>')
        .replaceAll('"', "'"),
    );
    const singleQuoted = exactArrayBuffer(zipSync(singleQuotedEntries));

    await expect(gateway.parse(accepted)).resolves.toMatchObject({
      ok: true,
      value: { length: 1001 },
    });
    const rejectedResult = await gateway.parse(rejected);
    expect(rejectedResult.ok).toBe(false);
    if (!rejectedResult.ok) {
      expect(rejectedResult.error.message).toContain('dimensiones');
    }
    const singleQuotedResult = await gateway.parse(singleQuoted);
    expect(singleQuotedResult.ok).toBe(false);
    if (!singleQuotedResult.ok) {
      expect(singleQuotedResult.error.message).toContain('dimensiones');
    }
  });

  it('returns an empty sheet safely for application-level header validation', async () => {
    const gateway = new XlsxVolunteerWorkbookGateway();
    const empty = await createWorkbook([[]]);

    await expect(gateway.parse(empty)).resolves.toEqual({
      ok: true,
      value: [],
    });
  });

  it('rejects highly compressed and remote-dimension worksheets before normal parsing', async () => {
    const gateway = new XlsxVolunteerWorkbookGateway();
    const highlyCompressed = exactArrayBuffer(
      zipSync(
        {
          'xl/worksheets/sheet1.xml': new Uint8Array(512 * 1024),
        },
        { level: 9 },
      ),
    );
    const remoteDimension = exactArrayBuffer(
      zipSync({
        'xl/workbook.xml': strToU8(minimalWorkbookXml()),
        'xl/_rels/workbook.xml.rels': strToU8(minimalRelationshipsXml()),
        'xl/worksheets/sheet1.xml': strToU8(
          minimalWorksheetXml('<dimension ref="A1:XFD1048576"/><sheetData/>'),
        ),
      }),
    );
    const sequentialRows = exactArrayBuffer(
      zipSync({
        'xl/workbook.xml': strToU8(minimalWorkbookXml()),
        'xl/_rels/workbook.xml.rels': strToU8(minimalRelationshipsXml()),
        'xl/worksheets/sheet1.xml': strToU8(
          minimalWorksheetXml(
            `<sheetData>${'<row/>'.repeat(1002)}</sheetData>`,
          ),
        ),
      }),
    );
    const oversizedWorksheetName = 'xl/worksheets/sheet1.xml';
    const oversizedEntries = zipSync(
      {
        'xl/workbook.xml': strToU8(minimalWorkbookXml()),
        'xl/_rels/workbook.xml.rels': strToU8(minimalRelationshipsXml()),
        [oversizedWorksheetName]: strToU8(
          minimalWorksheetXml(
            `<sheetData>${' '.repeat(5 * 1024 * 1024)}</sheetData>`,
          ),
        ),
      },
      { level: 9 },
    );
    const forgedSize = exactArrayBuffer(
      replaceCentralDirectoryOriginalSize(
        oversizedEntries,
        oversizedWorksheetName,
        1024,
      ),
    );
    const compressedResult = await gateway.parse(highlyCompressed);
    expect(compressedResult.ok).toBe(false);
    if (!compressedResult.ok) {
      expect(compressedResult.error.message).toContain('descompresión');
    }
    const dimensionResult = await gateway.parse(remoteDimension);
    expect(dimensionResult.ok).toBe(false);
    if (!dimensionResult.ok) {
      expect(dimensionResult.error.message).toContain('dimensiones');
    }
    const sequentialRowsResult = await gateway.parse(sequentialRows);
    expect(sequentialRowsResult.ok).toBe(false);
    if (!sequentialRowsResult.ok) {
      expect(sequentialRowsResult.error.message).toContain('dimensiones');
    }
    const forgedSizeResult = await gateway.parse(forgedSize);
    expect(forgedSizeResult.ok).toBe(false);
    if (!forgedSizeResult.ok) {
      expect(forgedSizeResult.error.message).toContain('estructura');
    }
  });

  it('rejects a workbook relationship that redirects parsing around the validated worksheet', async () => {
    const gateway = new XlsxVolunteerWorkbookGateway();
    const normal = await createWorkbook([
      [
        ['Nombre completo', 'Correo', 'Celular'],
        ['Normal', null, null],
      ],
    ]);
    const entries = unzipSync(new Uint8Array(normal));
    const relationships = entries['xl/_rels/workbook.xml.rels'];
    expect(relationships).toBeDefined();
    if (!relationships) return;
    entries['xl/_rels/workbook.xml.rels'] = strToU8(
      strFromU8(relationships).replace(
        'Target="worksheets/sheet1.xml"',
        'Target="custom.xml"',
      ),
    );
    entries['xl/custom.xml'] = strToU8(
      '<worksheet><sheetData><row r="2001"><c r="A2001"/></row></sheetData></worksheet>',
    );
    const redirected = exactArrayBuffer(zipSync(entries));

    const result = await gateway.parse(redirected);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('relación de la hoja');
    }
  });

  it('rejects invalid workbook bytes with a safe error', async () => {
    const gateway = new XlsxVolunteerWorkbookGateway();
    const result = await gateway.parse(new Uint8Array([1, 2, 3]).buffer);
    expect(result).toMatchObject({ error: { code: 'validation' }, ok: false });
  });
});
