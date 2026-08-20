import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button } from '@sistema-voluntariado/ui';

import {
  volunteerImportLimits,
  type VolunteerRegistryService,
} from '../application/volunteer-registry-service';
import type { VolunteerImportPreview } from '../domain/volunteer-import';
import { duplicateEvidenceLabel } from '../domain/volunteer-duplicates';
import { downloadXlsx } from './download-xlsx';

export function VolunteerImportPage({
  service,
}: {
  readonly service: VolunteerRegistryService;
}) {
  const [preview, setPreview] = useState<VolunteerImportPreview | null>(null);
  const [acceptedDuplicates, setAcceptedDuplicates] = useState<
    ReadonlySet<number>
  >(new Set());
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { t } = useTranslation();

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(null);
    setAcceptedDuplicates(new Set());
    setMessage(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError(t('volunteers.import.invalidFile'));
      return;
    }
    if (file.size === 0 || file.size > volunteerImportLimits.maxFileBytes) {
      setError(t('volunteers.import.fileSize'));
      return;
    }
    setProcessing(true);
    setError(null);
    const result = await service.previewImport(await file.arrayBuffer());
    if (result.ok) setPreview(result.value);
    else setError(result.error.message);
    setProcessing(false);
  };

  const toggleDuplicate = (rowNumber: number) => {
    setAcceptedDuplicates((current) => {
      const next = new Set(current);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  };

  const confirm = async () => {
    if (!preview) return;
    setProcessing(true);
    setError(null);
    const result = await service.confirmImport(preview, [
      ...acceptedDuplicates,
    ]);
    if (result.ok) {
      setMessage(
        t('volunteers.import.completed', {
          count: result.value.insertedCount,
        }),
      );
      setPreview(null);
    } else {
      setError(result.error.message);
    }
    setProcessing(false);
  };

  const downloadTemplate = async () => {
    setProcessing(true);
    setError(null);
    const result = await service.createImportTemplate();
    if (result.ok) downloadXlsx(result.value, 'plantilla-voluntarios.xlsx');
    else setError(result.error.message);
    setProcessing(false);
  };

  return (
    <section className="admin-page">
      <header className="page-heading">
        <p className="eyebrow">{t('admin.eyebrow')}</p>
        <h1>{t('volunteers.import.title')}</h1>
        <p className="muted">{t('volunteers.import.description')}</p>
      </header>
      <section className="panel import-controls">
        <p>{t('volunteers.import.requirements')}</p>
        <div className="button-row">
          <Button disabled={processing} onClick={() => void downloadTemplate()}>
            {t('volunteers.import.template')}
          </Button>
          <label className="button file-button">
            {t('volunteers.import.select')}
            <input
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={processing}
              onChange={(event) => void selectFile(event)}
              type="file"
            />
          </label>
        </div>
      </section>
      {processing ? (
        <p role="status">{t('volunteers.import.processing')}</p>
      ) : null}
      {error ? <p className="notice notice--error">{error}</p> : null}
      {message ? (
        <p className="notice notice--success">
          {message}{' '}
          <Link to="/app/admin/volunteers">{t('volunteers.import.view')}</Link>
        </p>
      ) : null}
      {preview ? (
        <section className="import-preview">
          <div className="summary-grid">
            <div>
              <strong>{preview.totalDetected}</strong>
              <span>{t('volunteers.import.detected')}</span>
            </div>
            <div>
              <strong>{preview.validCount}</strong>
              <span>{t('volunteers.import.valid')}</span>
            </div>
            <div>
              <strong>{preview.invalidCount}</strong>
              <span>{t('volunteers.import.invalid')}</span>
            </div>
            <div>
              <strong>{preview.duplicateCount}</strong>
              <span>{t('volunteers.import.duplicates')}</span>
            </div>
          </div>
          <div className="data-list">
            {preview.rows.map((row) => (
              <article className="data-card import-row" key={row.rowNumber}>
                <div>
                  <strong>
                    {t('volunteers.import.row', { row: row.rowNumber })}
                  </strong>
                  <p>
                    {row.canonical?.fullName ??
                      t('volunteers.import.invalidRow')}
                  </p>
                </div>
                <div>
                  {row.errors.map((rowError) => (
                    <p className="field__error" key={rowError}>
                      {rowError}
                    </p>
                  ))}
                  {row.duplicateEvidence.map((duplicate, index) => (
                    <p
                      key={`${duplicate.source}-${duplicate.fullName}-${String(index)}`}
                    >
                      {t(
                        `volunteers.import.duplicateSource.${duplicate.source}`,
                      )}
                      : {duplicate.fullName} (
                      {duplicateEvidenceLabel(duplicate.matchedFields)})
                    </p>
                  ))}
                </div>
                <div>
                  {row.errors.length === 0 &&
                  row.duplicateEvidence.length > 0 ? (
                    <label>
                      <input
                        checked={acceptedDuplicates.has(row.rowNumber)}
                        onChange={() => {
                          toggleDuplicate(row.rowNumber);
                        }}
                        type="checkbox"
                      />{' '}
                      {t('volunteers.import.includeDuplicate')}
                    </label>
                  ) : row.errors.length === 0 ? (
                    t('volunteers.import.ready')
                  ) : (
                    t('volunteers.import.excluded')
                  )}
                </div>
              </article>
            ))}
          </div>
          <Button
            className="button--primary"
            disabled={
              processing || preview.validCount + acceptedDuplicates.size === 0
            }
            onClick={() => void confirm()}
          >
            {t('volunteers.import.confirm')}
          </Button>
          <p className="muted">{t('volunteers.import.atomicity')}</p>
        </section>
      ) : null}
    </section>
  );
}
