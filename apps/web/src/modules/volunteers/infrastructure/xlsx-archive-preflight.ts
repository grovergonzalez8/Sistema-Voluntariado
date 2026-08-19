import { strFromU8, Unzip, UnzipInflate, unzipSync } from 'fflate';

export const xlsxArchiveLimits = {
  maxCompressionRatio: 250,
  maxEntries: 100,
  maxEntryUncompressedBytes: 10 * 1024 * 1024,
  maxSpreadsheetColumn: 16,
  maxSpreadsheetRow: 1001,
  maxTotalUncompressedBytes: 20 * 1024 * 1024,
  maxWorkbookUncompressedBytes: 1024 * 1024,
  maxWorksheetUncompressedBytes: 5 * 1024 * 1024,
} as const;

interface XlsxArchivePreflightSuccess {
  readonly ok: true;
}

interface XlsxArchivePreflightFailure {
  readonly message: string;
  readonly ok: false;
}

export type XlsxArchivePreflightResult =
  XlsxArchivePreflightFailure | XlsxArchivePreflightSuccess;

class XlsxArchiveViolation extends Error {}

function actualEntryLimit(name: string): number {
  if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) {
    return xlsxArchiveLimits.maxWorksheetUncompressedBytes;
  }
  if (
    name.toLowerCase() === 'xl/workbook.xml' ||
    name.toLowerCase() === 'xl/_rels/workbook.xml.rels'
  ) {
    return xlsxArchiveLimits.maxWorkbookUncompressedBytes;
  }
  return xlsxArchiveLimits.maxEntryUncompressedBytes;
}

function assertActualArchiveExpansion(bytes: Uint8Array): void {
  let actualEntryCount = 0;
  let totalUncompressedBytes = 0;
  const unzipper = new Unzip((file) => {
    actualEntryCount += 1;
    if (
      actualEntryCount > xlsxArchiveLimits.maxEntries ||
      !isSafeEntryName(file.name) ||
      (file.compression !== 0 && file.compression !== 8)
    ) {
      throw new XlsxArchiveViolation(
        'El archivo Excel contiene una estructura no admitida.',
      );
    }
    let entryUncompressedBytes = 0;
    const entryLimit = actualEntryLimit(file.name);
    file.ondata = (error, data) => {
      if (error) throw error;
      entryUncompressedBytes += data.byteLength;
      totalUncompressedBytes += data.byteLength;
      if (
        entryUncompressedBytes > entryLimit ||
        totalUncompressedBytes > xlsxArchiveLimits.maxTotalUncompressedBytes
      ) {
        throw new XlsxArchiveViolation(
          'El archivo Excel supera los límites seguros de descompresión.',
        );
      }
    };
    file.start();
  });
  unzipper.register(UnzipInflate);

  const chunkSize = 4 * 1024;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, bytes.byteLength);
    unzipper.push(bytes.subarray(offset, end), end === bytes.byteLength);
  }
}

function columnNumber(reference: string): number {
  let value = 0;
  for (const character of reference) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value;
}

function isSafeEntryName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 200 &&
    !name.startsWith('/') &&
    !name.includes('\\') &&
    !name.split('/').includes('..')
  );
}

function readXmlAttribute(markup: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(
    `\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
  ).exec(markup);
  return match?.[1] ?? match?.[2] ?? null;
}

function worksheetBoundsViolation(): never {
  throw new XlsxArchiveViolation(
    'El archivo excede las dimensiones admitidas para la plantilla.',
  );
}

function assertCellReference(reference: string): void {
  const terminalReference = reference.split(':').at(-1);
  const match = terminalReference
    ? /^\$?([A-Z]+)\$?([0-9]+)$/i.exec(terminalReference)
    : null;
  const column = match?.[1]?.toUpperCase();
  const row = match?.[2];
  if (
    !column ||
    !row ||
    columnNumber(column) > xlsxArchiveLimits.maxSpreadsheetColumn ||
    Number(row) > xlsxArchiveLimits.maxSpreadsheetRow
  ) {
    worksheetBoundsViolation();
  }
}

function assertWorksheetBounds(xml: string): void {
  for (const match of xml.matchAll(
    /<(?:[^\s<>/:]+:)?(dimension|c)\b([^>]*)/gi,
  )) {
    const tagName = match[1]?.toLowerCase();
    const markup = match[2];
    if (!tagName || markup === undefined) worksheetBoundsViolation();
    const reference = readXmlAttribute(
      markup,
      tagName === 'dimension' ? 'ref' : 'r',
    );
    if (reference !== null) assertCellReference(reference);
  }
  let effectiveRow = 0;
  for (const match of xml.matchAll(/<(?:[^\s<>/:]+:)?row\b([^>]*)/gi)) {
    const markup = match[1];
    if (markup === undefined) worksheetBoundsViolation();
    const row = readXmlAttribute(markup, 'r');
    if (row !== null && !/^[1-9][0-9]*$/.test(row)) {
      worksheetBoundsViolation();
    }
    effectiveRow = row === null ? effectiveRow + 1 : Number(row);
    if (effectiveRow > xlsxArchiveLimits.maxSpreadsheetRow) {
      worksheetBoundsViolation();
    }
  }
}

function resolveWorkbookTarget(target: string): string | null {
  if (target.includes('\\') || target.includes('?') || target.includes('#')) {
    return null;
  }
  const segments = (target.startsWith('/') ? target.slice(1) : `xl/${target}`)
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.');
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '..') {
      if (resolved.length === 0) return null;
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }
  return resolved.join('/');
}

export function preflightXlsxArchive(
  buffer: ArrayBuffer,
): XlsxArchivePreflightResult {
  const bytes = new Uint8Array(buffer);
  const workbookNames: string[] = [];
  const workbookRelationshipNames: string[] = [];
  const worksheetNames: string[] = [];
  let entryCount = 0;
  let totalUncompressedBytes = 0;

  try {
    unzipSync(bytes, {
      filter: (entry) => {
        entryCount += 1;
        if (
          entryCount > xlsxArchiveLimits.maxEntries ||
          !isSafeEntryName(entry.name) ||
          (entry.compression !== 0 && entry.compression !== 8)
        ) {
          throw new XlsxArchiveViolation(
            'El archivo Excel contiene una estructura no admitida.',
          );
        }
        totalUncompressedBytes += entry.originalSize;
        if (
          entry.originalSize > xlsxArchiveLimits.maxEntryUncompressedBytes ||
          totalUncompressedBytes >
            xlsxArchiveLimits.maxTotalUncompressedBytes ||
          (entry.originalSize >= 64 * 1024 &&
            entry.originalSize / Math.max(entry.size, 1) >
              xlsxArchiveLimits.maxCompressionRatio)
        ) {
          throw new XlsxArchiveViolation(
            'El archivo Excel supera los límites seguros de descompresión.',
          );
        }
        if (/^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name)) {
          if (
            entry.originalSize > xlsxArchiveLimits.maxWorksheetUncompressedBytes
          ) {
            throw new XlsxArchiveViolation(
              'La hoja Excel supera el tamaño estructural admitido.',
            );
          }
          worksheetNames.push(entry.name);
        }
        if (entry.name.toLowerCase() === 'xl/workbook.xml') {
          if (
            entry.originalSize > xlsxArchiveLimits.maxWorkbookUncompressedBytes
          ) {
            throw new XlsxArchiveViolation(
              'La estructura del libro Excel supera el tamaño admitido.',
            );
          }
          workbookNames.push(entry.name);
        }
        if (entry.name.toLowerCase() === 'xl/_rels/workbook.xml.rels') {
          if (
            entry.originalSize > xlsxArchiveLimits.maxWorkbookUncompressedBytes
          ) {
            throw new XlsxArchiveViolation(
              'La estructura del libro Excel supera el tamaño admitido.',
            );
          }
          workbookRelationshipNames.push(entry.name);
        }
        return false;
      },
    });

    if (
      worksheetNames.length !== 1 ||
      workbookNames.length !== 1 ||
      workbookRelationshipNames.length !== 1
    ) {
      return {
        message:
          'El archivo debe contener exactamente una hoja. Usa únicamente la hoja de la plantilla.',
        ok: false,
      };
    }

    // ZIP sizes are attacker-controlled metadata. Count bytes emitted by the
    // streaming inflater before any normal workbook parsing trusts the archive.
    assertActualArchiveExpansion(bytes);

    const worksheetName = worksheetNames[0];
    const workbookName = workbookNames[0];
    const workbookRelationshipName = workbookRelationshipNames[0];
    const extracted = unzipSync(bytes, {
      filter: (entry) =>
        entry.name === worksheetName ||
        entry.name === workbookName ||
        entry.name === workbookRelationshipName,
    });
    const worksheet = worksheetName ? extracted[worksheetName] : undefined;
    const workbook = workbookName ? extracted[workbookName] : undefined;
    const workbookRelationships = workbookRelationshipName
      ? extracted[workbookRelationshipName]
      : undefined;
    if (!worksheet || !workbook || !workbookRelationships) {
      throw new XlsxArchiveViolation(
        'No fue posible localizar la hoja del archivo Excel.',
      );
    }
    const workbookXml = strFromU8(workbook);
    const sheetTags = [
      ...workbookXml.matchAll(/<(?:[^\s<>/:]+:)?sheet\b([^>]*)/gi),
    ];
    if (sheetTags.length !== 1) {
      return {
        message:
          'El archivo debe contener exactamente una hoja. Usa únicamente la hoja de la plantilla.',
        ok: false,
      };
    }
    const sheetMarkup = sheetTags[0]?.[1];
    const relationshipId = sheetMarkup
      ? readXmlAttribute(sheetMarkup, 'r:id')
      : null;
    const relationshipTags = [
      ...strFromU8(workbookRelationships).matchAll(
        /<(?:[^\s<>/:]+:)?Relationship\b([^>]*)/gi,
      ),
    ];
    const worksheetRelationships = relationshipTags.filter((match) => {
      const markup = match[1];
      return (
        markup !== undefined &&
        readXmlAttribute(markup, 'Id') === relationshipId &&
        readXmlAttribute(markup, 'Type')?.endsWith('/worksheet') === true &&
        readXmlAttribute(markup, 'TargetMode') !== 'External'
      );
    });
    const relationshipMarkup = worksheetRelationships[0]?.[1];
    const relationshipTarget = relationshipMarkup
      ? readXmlAttribute(relationshipMarkup, 'Target')
      : null;
    if (
      worksheetRelationships.length !== 1 ||
      relationshipTarget === null ||
      resolveWorkbookTarget(relationshipTarget) !== worksheetName
    ) {
      throw new XlsxArchiveViolation(
        'La relación de la hoja Excel no coincide con su contenido validado.',
      );
    }
    assertWorksheetBounds(strFromU8(worksheet));
    return { ok: true };
  } catch (error: unknown) {
    return {
      message:
        error instanceof XlsxArchiveViolation
          ? error.message
          : 'No fue posible leer o generar el archivo Excel.',
      ok: false,
    };
  }
}
