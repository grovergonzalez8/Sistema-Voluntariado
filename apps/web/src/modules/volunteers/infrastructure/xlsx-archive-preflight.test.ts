import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';

import {
  preflightXlsxArchive,
  xlsxArchiveLimits,
  type XlsxArchiveLimits,
} from './xlsx-archive-preflight';

const spreadsheetNamespace =
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const officeRelationshipNamespace =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationshipNamespace =
  'http://schemas.openxmlformats.org/package/2006/relationships';
const worksheetType = `${officeRelationshipNamespace}/worksheet`;

function workbookXml(
  sheets = '<sheet name="Voluntarios" r:id="rId1"/>',
  relationshipPrefix = 'r',
  relationshipNamespace = officeRelationshipNamespace,
): string {
  return `<workbook xmlns="${spreadsheetNamespace}" xmlns:${relationshipPrefix}="${relationshipNamespace}"><sheets>${sheets}</sheets></workbook>`;
}

function relationshipsXml(
  relationships = `<Relationship Id="rId1" Type="${worksheetType}" Target="worksheets/sheet1.xml"/>`,
): string {
  return `<Relationships xmlns="${packageRelationshipNamespace}">${relationships}</Relationships>`;
}

function worksheetXml(content = '<sheetData/>'): string {
  return `<worksheet xmlns="${spreadsheetNamespace}">${content}</worksheet>`;
}

function archive(
  replacements: Readonly<Record<string, string>> = {},
  extras: Readonly<Record<string, string>> = {},
): Uint8Array {
  return zipSync({
    'xl/workbook.xml': strToU8(
      replacements['xl/workbook.xml'] ?? workbookXml(),
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      replacements['xl/_rels/workbook.xml.rels'] ?? relationshipsXml(),
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      replacements['xl/worksheets/sheet1.xml'] ?? worksheetXml(),
    ),
    ...Object.fromEntries(
      Object.entries(extras).map(([name, value]) => [name, strToU8(value)]),
    ),
  });
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function bytesEqualAt(
  bytes: Uint8Array,
  offset: number,
  expected: Uint8Array,
): boolean {
  if (offset + expected.byteLength > bytes.byteLength) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function replaceNameOccurrences(
  input: Uint8Array,
  source: string,
  target: string,
  occurrences?: ReadonlySet<number>,
): Uint8Array {
  const sourceBytes = strToU8(source);
  const targetBytes = strToU8(target);
  if (sourceBytes.byteLength !== targetBytes.byteLength) {
    throw new Error('Fixture names must have equal byte length');
  }
  const result = input.slice();
  let occurrence = 0;
  for (let offset = 0; offset < result.byteLength; offset += 1) {
    if (!bytesEqualAt(result, offset, sourceBytes)) continue;
    occurrence += 1;
    if (!occurrences || occurrences.has(occurrence)) {
      result.set(targetBytes, offset);
    }
    offset += sourceBytes.byteLength - 1;
  }
  return result;
}

function withLimits(changes: Partial<XlsxArchiveLimits>): XlsxArchiveLimits {
  return { ...xlsxArchiveLimits, ...changes };
}

async function expectRejected(
  bytes: Uint8Array,
  message: string,
  limits?: XlsxArchiveLimits,
): Promise<void> {
  const result = await preflightXlsxArchive(exactArrayBuffer(bytes), limits);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.message).toContain(message);
}

describe('preflightXlsxArchive', () => {
  it('accepts a minimal standard XLSX structure', async () => {
    await expect(
      preflightXlsxArchive(exactArrayBuffer(archive())),
    ).resolves.toEqual({ ok: true });
  });

  it('rejects invalid, truncated and incomplete ZIP structures safely', async () => {
    const valid = archive();
    await expectRejected(new Uint8Array([1, 2, 3]), 'estructura');
    await expectRejected(valid.slice(0, valid.byteLength - 5), 'estructura');
    await expectRejected(
      zipSync({
        'xl/workbook.xml': strToU8(workbookXml()),
        'xl/worksheets/sheet1.xml': strToU8(worksheetXml()),
      }),
      'estructura',
    );
  });

  it('rejects duplicate critical names and unsafe paths', async () => {
    const withAlias = archive({}, { 'xl/workbook.xm2': workbookXml() });
    const duplicate = replaceNameOccurrences(
      withAlias,
      'xl/workbook.xm2',
      'xl/workbook.xml',
    );
    await expectRejected(duplicate, 'estructura');
    await expectRejected(
      archive({}, { '../outside.xml': '<ignored/>' }),
      'estructura',
    );
  });

  it('rejects disagreement between a local entry and its central record', async () => {
    const inconsistent = replaceNameOccurrences(
      archive({}, { 'xl/workbook.xm2': workbookXml() }),
      'xl/workbook.xm2',
      'xl/workbook.xml',
      new Set([1]),
    );
    await expectRejected(inconsistent, 'estructura');
  });

  it('applies exact and plus-one entry, total and entry-count limits', async () => {
    const bytes = archive();
    const worksheetBytes = strToU8(worksheetXml()).byteLength;
    const workbookBytes = strToU8(workbookXml()).byteLength;
    const relationshipBytes = strToU8(relationshipsXml()).byteLength;
    const workbookStructureBytes = Math.max(workbookBytes, relationshipBytes);
    const totalBytes =
      strToU8(workbookXml()).byteLength +
      strToU8(relationshipsXml()).byteLength +
      worksheetBytes;

    await expect(
      preflightXlsxArchive(
        exactArrayBuffer(bytes),
        withLimits({
          maxTotalUncompressedBytes: totalBytes,
          maxWorkbookUncompressedBytes: workbookStructureBytes,
          maxWorksheetUncompressedBytes: worksheetBytes,
        }),
      ),
    ).resolves.toEqual({ ok: true });
    await expectRejected(
      bytes,
      'descompresión',
      withLimits({
        maxWorkbookUncompressedBytes: workbookStructureBytes - 1,
      }),
    );
    const largerWorkbookXml = workbookXml(
      `<!-- ${'x'.repeat(128)} --><sheet name="Voluntarios" r:id="rId1"/>`,
    );
    const largerWorkbook = archive({
      'xl/workbook.xml': largerWorkbookXml,
    });
    const largerWorkbookBytes = strToU8(largerWorkbookXml).byteLength;
    await expect(
      preflightXlsxArchive(
        exactArrayBuffer(largerWorkbook),
        withLimits({ maxWorkbookUncompressedBytes: largerWorkbookBytes }),
      ),
    ).resolves.toEqual({ ok: true });
    await expectRejected(
      largerWorkbook,
      'descompresión',
      withLimits({ maxWorkbookUncompressedBytes: largerWorkbookBytes - 1 }),
    );
    await expectRejected(
      bytes,
      'descompresión',
      withLimits({ maxWorksheetUncompressedBytes: worksheetBytes - 1 }),
    );
    await expectRejected(
      bytes,
      'descompresión',
      withLimits({ maxTotalUncompressedBytes: totalBytes - 1 }),
    );
    await expect(
      preflightXlsxArchive(
        exactArrayBuffer(bytes),
        withLimits({ maxEntries: 3 }),
      ),
    ).resolves.toEqual({ ok: true });
    await expectRejected(
      archive({}, { 'docProps/core.xml': '<core/>' }),
      'estructura',
      withLimits({ maxEntries: 3 }),
    );
    await expect(
      preflightXlsxArchive(
        exactArrayBuffer(archive({}, { 'docProps/core.xml': '<core/>' })),
        withLimits({
          maxEntryUncompressedBytes: strToU8('<core/>').byteLength,
        }),
      ),
    ).resolves.toEqual({ ok: true });
    await expectRejected(
      archive({}, { 'docProps/core.xml': '<core/>' }),
      'descompresión',
      withLimits({
        maxEntryUncompressedBytes: strToU8('<core/>').byteLength - 1,
      }),
    );
  });

  it('stops on emitted bytes independently from metadata prechecks', async () => {
    const worksheetPath = 'xl/worksheets/sheet1.xml';
    const emittedOverLimit = archive({
      [worksheetPath]: worksheetXml(
        `<sheetData>${' '.repeat(2048)}</sheetData>`,
      ),
    });
    const result = await preflightXlsxArchive(
      exactArrayBuffer(emittedOverLimit),
      withLimits({ maxWorksheetUncompressedBytes: 1024 }),
      xlsxArchiveLimits,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('descompresión');
  });

  it('enforces exactly one logical sheet, including hidden sheets', async () => {
    const secondSheet = `<sheet name="Otra" sheetId="2" r:id="rId2"/>`;
    await expectRejected(
      archive({
        'xl/workbook.xml': workbookXml(
          `<sheet name="Voluntarios" r:id="rId1"/>${secondSheet}`,
        ),
      }),
      'una sola hoja',
    );
    await expectRejected(
      archive({
        'xl/workbook.xml': workbookXml(
          `<sheet name="Voluntarios" r:id="rId1"/>${secondSheet.replace('/>', ' state="hidden"/>')}`,
        ),
      }),
      'una sola hoja',
    );
  });

  it('rejects additional, external and escaping worksheet relationships', async () => {
    const primary = `<Relationship Id="rId1" Type="${worksheetType}" Target="worksheets/sheet1.xml"/>`;
    await expectRejected(
      archive({
        'xl/_rels/workbook.xml.rels': relationshipsXml(
          `${primary}<Relationship Id="rId2" Type="${worksheetType}" Target="worksheets/sheet1.xml"/>`,
        ),
      }),
      'una sola hoja',
    );
    await expectRejected(
      archive({
        'xl/_rels/workbook.xml.rels': relationshipsXml(
          primary.replace('/>', ' TargetMode="External"/>'),
        ),
      }),
      'relación',
    );
    await expectRejected(
      archive({
        'xl/_rels/workbook.xml.rels': relationshipsXml(
          primary.replace('worksheets/sheet1.xml', 'worksheets/./sheet1.xml'),
        ),
      }),
      'relación',
    );
    await expectRejected(
      archive({
        'xl/_rels/workbook.xml.rels': relationshipsXml(
          primary.replace(
            'worksheets/sheet1.xml',
            '../../worksheets/sheet1.xml',
          ),
        ),
      }),
      'relación',
    );
  });

  it('resolves relationship attributes by namespace rather than prefix', async () => {
    const alternatePrefix = archive({
      'xl/workbook.xml': workbookXml(
        '<sheet name="Voluntarios" q:id="rId1"/>',
        'q',
      ),
    });
    await expect(
      preflightXlsxArchive(exactArrayBuffer(alternatePrefix)),
    ).resolves.toEqual({ ok: true });

    await expectRejected(
      archive({
        'xl/workbook.xml': workbookXml(
          '<sheet name="Voluntarios" q:id="rId1"/>',
          'q',
          'urn:not-office-relationships',
        ),
      }),
      'estructura',
    );
  });

  it('ignores sheet-like text inside XML comments', async () => {
    const commented = archive({
      'xl/workbook.xml': workbookXml(
        '<!-- <sheet name="Falsa" r:id="rId2"/> --><sheet name="Voluntarios" r:id="rId1"/>',
      ),
    });
    await expect(
      preflightXlsxArchive(exactArrayBuffer(commented)),
    ).resolves.toEqual({ ok: true });
  });

  it('rejects semantic elements bound to a foreign namespace', async () => {
    await expectRejected(
      archive({
        'xl/workbook.xml': workbookXml(
          '<sheet name="Voluntarios" r:id="rId1"/><q:sheet xmlns:q="urn:not-spreadsheet" name="Otra" r:id="rId2"/>',
        ),
      }),
      'estructura',
    );
    await expectRejected(
      archive({
        'xl/worksheets/sheet1.xml': worksheetXml(
          '<sheetData><row><q:c xmlns:q="urn:not-spreadsheet" r="XFD1"/></row></sheetData>',
        ),
      }),
      'estructura',
    );
  });
});
