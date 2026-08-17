import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';
import { readSheet } from 'read-excel-file/universal';
import writeXlsxFile, { type SheetData } from 'write-excel-file/universal';

import type { VolunteerWorkbookGateway } from '../application/volunteer-workbook-gateway';
import type { RegisteredVolunteer } from '../domain/registered-volunteer';

const headers = ['Nombre completo', 'Correo', 'Celular'];

function textCell(value: string | null) {
  return value === null ? null : { type: String, value };
}

async function toArrayBuffer(sheetData: SheetData): Promise<ArrayBuffer> {
  const blob = await writeXlsxFile(sheetData, {
    columns: [{ width: 32 }, { width: 34 }, { width: 22 }, { width: 24 }],
    sheet: 'Voluntarios',
  }).toBlob();
  return blob.arrayBuffer();
}

function workbookFailure<T>(): Result<T> {
  return failure({
    code: 'validation',
    message: 'No fue posible leer o generar el archivo Excel.',
  });
}

export class XlsxVolunteerWorkbookGateway implements VolunteerWorkbookGateway {
  public async parse(
    buffer: ArrayBuffer,
  ): Promise<
    Result<readonly (readonly (boolean | Date | number | string | null)[])[]>
  > {
    try {
      const sheet = await readSheet(buffer);
      const rows: (boolean | Date | number | string | null)[][] = [];
      for (const row of sheet) {
        const cells: (boolean | Date | number | string | null)[] = [];
        for (const cell of row) {
          if (
            cell === null ||
            typeof cell === 'string' ||
            typeof cell === 'number' ||
            typeof cell === 'boolean' ||
            cell instanceof Date
          ) {
            cells.push(cell);
          } else {
            return workbookFailure();
          }
        }
        rows.push(cells);
      }
      return success(rows);
    } catch {
      return workbookFailure();
    }
  }

  public async createTemplate(): Promise<Result<ArrayBuffer>> {
    try {
      return success(
        await toArrayBuffer([
          headers.map((value) => ({ type: String, value })),
        ]),
      );
    } catch {
      return workbookFailure();
    }
  }

  public async createExport(
    volunteers: readonly RegisteredVolunteer[],
  ): Promise<Result<ArrayBuffer>> {
    try {
      const data: SheetData = [
        [...headers, 'Fecha de registro'].map((value) => ({
          type: String,
          value,
        })),
        ...volunteers.map((volunteer) => [
          textCell(volunteer.fullName),
          textCell(volunteer.email),
          textCell(volunteer.phone),
          textCell(volunteer.createdAt),
        ]),
      ];
      return success(await toArrayBuffer(data));
    } catch {
      return workbookFailure();
    }
  }
}
