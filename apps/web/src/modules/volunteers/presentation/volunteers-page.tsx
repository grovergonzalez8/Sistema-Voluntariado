import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button, Field } from '@sistema-voluntariado/ui';

import type { VolunteerRegistryService } from '../application/volunteer-registry-service';
import type {
  RegisteredVolunteer,
  VolunteerSort,
} from '../domain/registered-volunteer';
import { downloadXlsx } from './download-xlsx';

const pageSize = 25;

export function VolunteersPage({
  service,
}: {
  readonly service: VolunteerRegistryService;
}) {
  const [volunteers, setVolunteers] = useState<readonly RegisteredVolunteer[]>(
    [],
  );
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<VolunteerSort>('newest');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const requestGeneration = useRef(0);
  const { t } = useTranslation();

  useEffect(() => {
    const generation = ++requestGeneration.current;
    void service
      .listVolunteers({ limit: pageSize, offset, search, sort })
      .then((result) => {
        if (generation !== requestGeneration.current) return;
        if (result.ok) {
          setVolunteers(result.value.items);
          setTotal(result.value.total);
          setError(null);
        } else {
          setError(result.error.message);
        }
        setLoading(false);
      });
    return () => {
      requestGeneration.current += 1;
    };
  }, [offset, search, service, sort]);

  const submitSearch = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setOffset(0);
    setSearch(searchInput.trim());
  };

  const page = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const exportCurrentResults = async () => {
    setExporting(true);
    setError(null);
    const result = await service.createExport({ search, sort });
    if (result.ok) {
      downloadXlsx(result.value, 'voluntarios.xlsx');
    } else {
      setError(result.error.message);
    }
    setExporting(false);
  };

  return (
    <section className="admin-page">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">{t('admin.eyebrow')}</p>
          <h1>{t('volunteers.title')}</h1>
          <p className="muted">{t('volunteers.description')}</p>
        </div>
        <div className="button-row">
          <Button
            disabled={exporting}
            onClick={() => void exportCurrentResults()}
          >
            {exporting
              ? t('volunteers.exporting')
              : t('volunteers.exportAction')}
          </Button>
          <Link className="button" to="/app/admin/volunteers/import">
            {t('volunteers.importAction')}
          </Link>
          <Link
            className="button button--primary"
            to="/app/admin/volunteers/new"
          >
            {t('volunteers.createAction')}
          </Link>
        </div>
      </header>
      <form className="search-row" onSubmit={submitSearch}>
        <Field
          label={t('volunteers.search')}
          maxLength={100}
          name="volunteerSearch"
          onChange={(event) => {
            setSearchInput(event.target.value);
          }}
          value={searchInput}
        />
        <label className="field">
          <span>{t('volunteers.sortLabel')}</span>
          <select
            onChange={(event) => {
              setLoading(true);
              setOffset(0);
              setSort(event.target.value as VolunteerSort);
            }}
            value={sort}
          >
            <option value="newest">{t('volunteers.sort.newest')}</option>
            <option value="oldest">{t('volunteers.sort.oldest')}</option>
            <option value="name_asc">{t('volunteers.sort.nameAsc')}</option>
            <option value="name_desc">{t('volunteers.sort.nameDesc')}</option>
          </select>
        </label>
        <Button type="submit">{t('volunteers.searchAction')}</Button>
      </form>
      {error ? <p className="notice notice--error">{error}</p> : null}
      {loading ? <p role="status">{t('common.loading')}</p> : null}
      {!loading && volunteers.length === 0 ? (
        <section className="panel empty-state">
          <h2>
            {search ? t('volunteers.noResults') : t('volunteers.emptyTitle')}
          </h2>
          <p>{t('volunteers.emptyDescription')}</p>
          <div className="button-row">
            <Link className="button" to="/app/admin/volunteers/new">
              {t('volunteers.createAction')}
            </Link>
            <Link className="button" to="/app/admin/volunteers/import">
              {t('volunteers.importAction')}
            </Link>
          </div>
        </section>
      ) : null}
      {!loading && volunteers.length > 0 ? (
        <>
          <p className="muted">{t('volunteers.results', { count: total })}</p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('volunteers.fullName')}</th>
                  <th>{t('volunteers.email')}</th>
                  <th>{t('volunteers.phone')}</th>
                  <th>{t('volunteers.registeredAt')}</th>
                  <th>{t('volunteers.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {volunteers.map((volunteer) => (
                  <tr key={volunteer.id}>
                    <td>{volunteer.fullName}</td>
                    <td>{volunteer.email ?? t('common.notProvided')}</td>
                    <td>{volunteer.phone ?? t('common.notProvided')}</td>
                    <td>
                      <time dateTime={volunteer.createdAt}>
                        {new Date(volunteer.createdAt).toLocaleDateString()}
                      </time>
                    </td>
                    <td>
                      <Link to={`/app/admin/volunteers/${volunteer.id}`}>
                        {t('volunteers.view')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav
            aria-label={t('volunteers.paginationLabel')}
            className="pagination"
          >
            <Button
              disabled={offset === 0}
              onClick={() => {
                setLoading(true);
                setOffset(Math.max(0, offset - pageSize));
              }}
            >
              {t('volunteers.previous')}
            </Button>
            <span>{t('volunteers.page', { page, pageCount })}</span>
            <Button
              disabled={offset + pageSize >= total}
              onClick={() => {
                setLoading(true);
                setOffset(offset + pageSize);
              }}
            >
              {t('volunteers.next')}
            </Button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
