import {
  type Entry,
  type FileEntry,
  Uint8ArrayReader,
  ZipReader,
} from '@zip.js/zip.js';

const spreadsheetNamespace =
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const officeRelationshipNamespace =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationshipNamespace =
  'http://schemas.openxmlformats.org/package/2006/relationships';
const worksheetRelationshipType = `${officeRelationshipNamespace}/worksheet`;
const workbookPath = 'xl/workbook.xml';
const workbookRelationshipsPath = 'xl/_rels/workbook.xml.rels';

export interface XlsxArchiveLimits {
  readonly maxArchiveCompressedBytes: number;
  readonly maxCompressionRatio: number;
  readonly maxEntries: number;
  readonly maxEntryUncompressedBytes: number;
  readonly maxSpreadsheetColumn: number;
  readonly maxSpreadsheetRow: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxWorkbookUncompressedBytes: number;
  readonly maxWorksheetUncompressedBytes: number;
}

export const xlsxArchiveLimits: XlsxArchiveLimits = {
  maxArchiveCompressedBytes: 5 * 1024 * 1024,
  maxCompressionRatio: 250,
  maxEntries: 100,
  maxEntryUncompressedBytes: 10 * 1024 * 1024,
  maxSpreadsheetColumn: 16,
  maxSpreadsheetRow: 1001,
  maxTotalUncompressedBytes: 20 * 1024 * 1024,
  maxWorkbookUncompressedBytes: 1024 * 1024,
  maxWorksheetUncompressedBytes: 5 * 1024 * 1024,
};

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

interface ExpansionState {
  totalBytes: number;
}

function structureViolation(): never {
  throw new XlsxArchiveViolation(
    'El archivo Excel contiene una estructura no admitida.',
  );
}

function multiSheetViolation(): never {
  throw new XlsxArchiveViolation(
    'La importación admite archivos Excel con una sola hoja.',
  );
}

function expansionViolation(): never {
  throw new XlsxArchiveViolation(
    'El archivo Excel supera los límites seguros de descompresión.',
  );
}

function worksheetBoundsViolation(): never {
  throw new XlsxArchiveViolation(
    'El archivo excede las dimensiones admitidas para la plantilla.',
  );
}

function isSafeEntryName(name: string): boolean {
  const segments = name.split('/');
  return (
    name.length > 0 &&
    name.length <= 200 &&
    !name.startsWith('/') &&
    !name.includes('\\') &&
    segments.every(
      (segment, index) =>
        segment !== '.' &&
        segment !== '..' &&
        (segment.length > 0 || index === segments.length - 1),
    )
  );
}

function isWorksheetAlias(name: string): boolean {
  return /^xl\/worksheets\/[^/]+\.xml$/i.test(name);
}

function isCanonicalWorksheetPath(name: string): boolean {
  return /^xl\/worksheets\/[A-Za-z0-9_-]+\.xml$/.test(name);
}

function entryLimit(name: string, limits: XlsxArchiveLimits): number {
  if (isWorksheetAlias(name)) return limits.maxWorksheetUncompressedBytes;
  if (
    name === workbookPath ||
    name === workbookRelationshipsPath ||
    name.toLowerCase() === workbookPath ||
    name.toLowerCase() === workbookRelationshipsPath
  ) {
    return limits.maxWorkbookUncompressedBytes;
  }
  return limits.maxEntryUncompressedBytes;
}

function assertEntryMetadata(entry: Entry, limits: XlsxArchiveLimits): void {
  if (
    !isSafeEntryName(entry.filename) ||
    entry.directory ||
    entry.symlink ||
    entry.encrypted ||
    entry.zip64 ||
    (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) ||
    !Number.isSafeInteger(entry.compressedSize) ||
    !Number.isSafeInteger(entry.uncompressedSize) ||
    entry.compressedSize < 0 ||
    entry.uncompressedSize < 0
  ) {
    structureViolation();
  }
  if (
    entry.uncompressedSize > entryLimit(entry.filename, limits) ||
    (entry.uncompressedSize >= 64 * 1024 &&
      entry.uncompressedSize / Math.max(entry.compressedSize, 1) >
        limits.maxCompressionRatio)
  ) {
    expansionViolation();
  }
}

async function readEntry(
  entry: FileEntry,
  retain: boolean,
  limits: XlsxArchiveLimits,
  expansion: ExpansionState,
): Promise<Uint8Array | undefined> {
  let entryBytes = 0;
  const chunks: Uint8Array[] = [];
  const limit = entryLimit(entry.filename, limits);
  const sink = new WritableStream<Uint8Array>({
    write(chunk) {
      entryBytes += chunk.byteLength;
      expansion.totalBytes += chunk.byteLength;
      if (
        entryBytes > limit ||
        expansion.totalBytes > limits.maxTotalUncompressedBytes
      ) {
        expansionViolation();
      }
      if (retain && chunk.byteLength > 0) chunks.push(chunk.slice());
    },
  });

  await entry.getData(sink, {
    checkCrc32: true,
    checkOverlappingEntry: true,
    strictness: 'strict',
    useCompressionStream: false,
    useWebWorkers: false,
  });

  if (entryBytes !== entry.uncompressedSize) structureViolation();
  if (!retain) return undefined;
  const result = new Uint8Array(entryBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function decodeXml(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    structureViolation();
  }
}

function parseXml(
  bytes: Uint8Array,
  rootNamespace: string,
  rootLocalName: string,
): XMLDocument {
  const document = new DOMParser().parseFromString(
    decodeXml(bytes),
    'application/xml',
  );
  if (
    document.getElementsByTagName('parsererror').length > 0 ||
    document.documentElement.namespaceURI !== rootNamespace ||
    document.documentElement.localName !== rootLocalName
  ) {
    structureViolation();
  }
  return document;
}

function assertSemanticElementNamespaces(
  document: XMLDocument,
  namespace: string,
  localNames: ReadonlySet<string>,
): void {
  for (const element of document.getElementsByTagName('*')) {
    if (
      localNames.has(element.localName) &&
      element.namespaceURI !== namespace
    ) {
      structureViolation();
    }
  }
}

function columnNumber(reference: string): number {
  let value = 0;
  for (const character of reference) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value;
}

function assertCellReference(
  reference: string,
  limits: XlsxArchiveLimits,
): void {
  const terminalReference = reference.split(':').at(-1);
  const match = terminalReference
    ? /^\$?([A-Z]+)\$?([0-9]+)$/i.exec(terminalReference)
    : null;
  const column = match?.[1]?.toUpperCase();
  const row = match?.[2];
  if (
    !column ||
    !row ||
    columnNumber(column) > limits.maxSpreadsheetColumn ||
    Number(row) > limits.maxSpreadsheetRow
  ) {
    worksheetBoundsViolation();
  }
}

function assertWorksheetBounds(
  worksheet: XMLDocument,
  limits: XlsxArchiveLimits,
): void {
  assertSemanticElementNamespaces(
    worksheet,
    spreadsheetNamespace,
    new Set(['c', 'dimension', 'row']),
  );
  const dimensions = worksheet.getElementsByTagNameNS(
    spreadsheetNamespace,
    'dimension',
  );
  for (const dimension of dimensions) {
    const reference = dimension.getAttribute('ref');
    if (reference !== null) assertCellReference(reference, limits);
  }

  const cells = worksheet.getElementsByTagNameNS(spreadsheetNamespace, 'c');
  for (const cell of cells) {
    const reference = cell.getAttribute('r');
    if (reference !== null) assertCellReference(reference, limits);
  }

  let effectiveRow = 0;
  const rows = worksheet.getElementsByTagNameNS(spreadsheetNamespace, 'row');
  for (const rowElement of rows) {
    const row = rowElement.getAttribute('r');
    if (row !== null && !/^[1-9][0-9]*$/.test(row)) {
      worksheetBoundsViolation();
    }
    effectiveRow = row === null ? effectiveRow + 1 : Number(row);
    if (effectiveRow > limits.maxSpreadsheetRow) worksheetBoundsViolation();
  }
}

function resolveWorkbookTarget(target: string): string | null {
  return /^worksheets\/[A-Za-z0-9_-]+\.xml$/.test(target)
    ? `xl/${target}`
    : null;
}

function assertWorkbookStructure(
  workbookBytes: Uint8Array,
  relationshipBytes: Uint8Array,
  worksheetPath: string,
): void {
  const workbook = parseXml(workbookBytes, spreadsheetNamespace, 'workbook');
  assertSemanticElementNamespaces(
    workbook,
    spreadsheetNamespace,
    new Set(['sheet']),
  );
  const sheets = workbook.getElementsByTagNameNS(spreadsheetNamespace, 'sheet');
  if (sheets.length !== 1) multiSheetViolation();
  const relationshipId = sheets[0]?.getAttributeNS(
    officeRelationshipNamespace,
    'id',
  );
  if (!relationshipId) structureViolation();

  const relationshipsDocument = parseXml(
    relationshipBytes,
    packageRelationshipNamespace,
    'Relationships',
  );
  assertSemanticElementNamespaces(
    relationshipsDocument,
    packageRelationshipNamespace,
    new Set(['Relationship']),
  );
  const relationships = relationshipsDocument.getElementsByTagNameNS(
    packageRelationshipNamespace,
    'Relationship',
  );
  const worksheetRelationships = [...relationships].filter(
    (relationship) =>
      relationship.getAttribute('Type') === worksheetRelationshipType,
  );
  if (worksheetRelationships.length !== 1) multiSheetViolation();

  const relationship = worksheetRelationships[0];
  if (!relationship) structureViolation();
  const targetMode = relationship.getAttribute('TargetMode');
  const target = relationship.getAttribute('Target');
  if (
    relationship.getAttribute('Id') !== relationshipId ||
    (targetMode !== null && targetMode !== 'Internal') ||
    target === null ||
    resolveWorkbookTarget(target) !== worksheetPath
  ) {
    throw new XlsxArchiveViolation(
      'La relación de la hoja Excel no coincide con su contenido validado.',
    );
  }
}

function criticalEntries(entries: readonly Entry[]): {
  workbook: FileEntry;
  relationships: FileEntry;
  worksheet: FileEntry;
} {
  const workbookAliases = entries.filter(
    (entry) => entry.filename.toLowerCase() === workbookPath,
  );
  const relationshipAliases = entries.filter(
    (entry) => entry.filename.toLowerCase() === workbookRelationshipsPath,
  );
  const worksheetAliases = entries.filter((entry) =>
    isWorksheetAlias(entry.filename),
  );
  if (workbookAliases.length !== 1 || relationshipAliases.length !== 1) {
    structureViolation();
  }
  if (worksheetAliases.length !== 1) multiSheetViolation();
  const workbook = workbookAliases[0];
  const relationships = relationshipAliases[0];
  const worksheet = worksheetAliases[0];
  if (
    !workbook ||
    !relationships ||
    !worksheet ||
    workbook.directory ||
    relationships.directory ||
    worksheet.directory ||
    workbook.filename !== workbookPath ||
    relationships.filename !== workbookRelationshipsPath ||
    !isCanonicalWorksheetPath(worksheet.filename)
  ) {
    structureViolation();
  }
  return { relationships, workbook, worksheet };
}

export async function preflightXlsxArchive(
  buffer: ArrayBuffer,
  limits: XlsxArchiveLimits = xlsxArchiveLimits,
  metadataLimits: XlsxArchiveLimits = limits,
): Promise<XlsxArchivePreflightResult> {
  if (
    buffer.byteLength === 0 ||
    buffer.byteLength > limits.maxArchiveCompressedBytes
  ) {
    return {
      message: 'El archivo debe ser .xlsx y no superar 5 MiB.',
      ok: false,
    };
  }

  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(buffer)), {
    filenameValidation: 'strict',
    strictness: 'strict',
    useCompressionStream: false,
    useWebWorkers: false,
  });
  try {
    const entries = await reader.getEntries();
    if (entries.length === 0 || entries.length > limits.maxEntries) {
      structureViolation();
    }

    let declaredTotal = 0;
    for (const entry of entries) {
      assertEntryMetadata(entry, metadataLimits);
      declaredTotal += entry.uncompressedSize;
      if (declaredTotal > metadataLimits.maxTotalUncompressedBytes) {
        expansionViolation();
      }
    }

    const critical = criticalEntries(entries);
    const retained = new Map<string, Uint8Array>();
    const expansion: ExpansionState = { totalBytes: 0 };
    for (const entry of entries) {
      if (entry.directory) continue;
      const retain =
        entry === critical.workbook ||
        entry === critical.relationships ||
        entry === critical.worksheet;
      const data = await readEntry(entry, retain, limits, expansion);
      if (data) retained.set(entry.filename, data);
    }
    const workbookBytes = retained.get(workbookPath);
    const relationshipBytes = retained.get(workbookRelationshipsPath);
    const worksheetBytes = retained.get(critical.worksheet.filename);
    if (!workbookBytes || !relationshipBytes || !worksheetBytes) {
      structureViolation();
    }
    assertWorkbookStructure(
      workbookBytes,
      relationshipBytes,
      critical.worksheet.filename,
    );
    assertWorksheetBounds(
      parseXml(worksheetBytes, spreadsheetNamespace, 'worksheet'),
      limits,
    );
    return { ok: true };
  } catch (error: unknown) {
    return {
      message:
        error instanceof XlsxArchiveViolation
          ? error.message
          : 'El archivo Excel contiene una estructura no admitida.',
      ok: false,
    };
  } finally {
    await reader.close();
  }
}
