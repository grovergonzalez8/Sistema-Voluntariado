import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import writeXlsxFile, { type SheetData } from 'write-excel-file/universal';

import { XlsxVolunteerWorkbookGateway } from './xlsx-volunteer-workbook-gateway';

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

function insertOrphanLocalEntries(
  archive: Uint8Array,
  entryCount: number,
): Uint8Array {
  const sourceView = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  let endOffset = archive.byteLength - 22;
  while (
    endOffset >= 0 &&
    sourceView.getUint32(endOffset, true) !== 0x06054b50
  ) {
    endOffset -= 1;
  }
  if (endOffset < 0) throw new Error('ZIP end record not found');
  const centralOffset = sourceView.getUint32(endOffset + 16, true);
  const records: Uint8Array[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    const name = strToU8(`orphan-${String(index)}.xml`);
    const record = new Uint8Array(30 + name.byteLength);
    const view = new DataView(record.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(26, name.byteLength, true);
    record.set(name, 30);
    records.push(record);
  }
  const insertedLength = records.reduce(
    (total, record) => total + record.byteLength,
    0,
  );
  const result = new Uint8Array(archive.byteLength + insertedLength);
  result.set(archive.subarray(0, centralOffset));
  let writeOffset = centralOffset;
  for (const record of records) {
    result.set(record, writeOffset);
    writeOffset += record.byteLength;
  }
  result.set(archive.subarray(centralOffset), writeOffset);
  new DataView(result.buffer).setUint32(
    endOffset + insertedLength + 16,
    centralOffset + insertedLength,
    true,
  );
  return result;
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
        email: `formula-${String(index)}@example.invalid`,
        fullName,
        id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        phone: '+591 070000001',
        updatedAt: '2026-08-16T12:00:00.000Z',
      })),
    );
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const parsed = await gateway.parse(exported.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.slice(1).map((row) => row[0])).toEqual(formulaPrefixes);
    const entries = unzipSync(new Uint8Array(exported.value));
    const worksheet = entries['xl/worksheets/sheet1.xml'];
    expect(worksheet).toBeDefined();
    if (worksheet) expect(strFromU8(worksheet)).not.toContain('<f');
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
        .replace('<workbook ', '<workbook xmlns:x="urn:test" ')
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
      expect(result.error.message).toContain('exactamente una hoja');
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
        .replace('<worksheet ', '<worksheet xmlns:x="urn:test" ')
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
        'xl/workbook.xml': strToU8(
          '<workbook xmlns:r="relationships"><sheets><sheet name="Voluntarios" r:id="rId1"/></sheets></workbook>',
        ),
        'xl/_rels/workbook.xml.rels': strToU8(
          '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        ),
        'xl/worksheets/sheet1.xml': strToU8(
          '<worksheet><dimension ref="A1:XFD1048576"/><sheetData/></worksheet>',
        ),
      }),
    );
    const sequentialRows = exactArrayBuffer(
      zipSync({
        'xl/workbook.xml': strToU8(
          '<workbook xmlns:r="relationships"><sheets><sheet name="Voluntarios" r:id="rId1"/></sheets></workbook>',
        ),
        'xl/_rels/workbook.xml.rels': strToU8(
          '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        ),
        'xl/worksheets/sheet1.xml': strToU8(
          `<worksheet><sheetData>${'<row/>'.repeat(1002)}</sheetData></worksheet>`,
        ),
      }),
    );
    const oversizedWorksheetName = 'xl/worksheets/sheet1.xml';
    const oversizedEntries = zipSync(
      {
        'xl/workbook.xml': strToU8(
          '<workbook xmlns:r="relationships"><sheets><sheet name="Voluntarios" r:id="rId1"/></sheets></workbook>',
        ),
        'xl/_rels/workbook.xml.rels': strToU8(
          '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        ),
        [oversizedWorksheetName]: strToU8(
          `<worksheet><sheetData>${' '.repeat(5 * 1024 * 1024)}</sheetData></worksheet>`,
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
    const orphanLocalEntries = exactArrayBuffer(
      insertOrphanLocalEntries(
        zipSync({
          'xl/workbook.xml': strToU8(
            '<workbook xmlns:r="relationships"><sheets><sheet name="Voluntarios" r:id="rId1"/></sheets></workbook>',
          ),
          'xl/_rels/workbook.xml.rels': strToU8(
            '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
          ),
          'xl/worksheets/sheet1.xml': strToU8(
            '<worksheet><sheetData/></worksheet>',
          ),
        }),
        101,
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
      expect(forgedSizeResult.error.message).toContain('descompresión');
    }
    const orphanEntriesResult = await gateway.parse(orphanLocalEntries);
    expect(orphanEntriesResult.ok).toBe(false);
    if (!orphanEntriesResult.ok) {
      expect(orphanEntriesResult.error.message).toContain('estructura');
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
