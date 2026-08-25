import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Button, Field } from '@sistema-voluntariado/ui';

import type { ProjectManagementService } from '../application/project-management-service';
import type { Project } from '../domain/project';

const pageSize = 25;

export function ProjectsPage({
  service,
}: {
  readonly service: ProjectManagementService;
}) {
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const requestGeneration = useRef(0);
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    void service.getCapabilities().then((result) => {
      if (active && result.ok) setCanCreate(result.value.manage);
    });
    return () => {
      active = false;
    };
  }, [service]);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    void service
      .listProjects({ limit: pageSize, offset, search })
      .then((result) => {
        if (generation !== requestGeneration.current) return;
        if (result.ok) {
          setProjects(result.value.items);
          setTotal(result.value.total);
          setError(null);
        } else setError(result.error.message);
        setLoading(false);
      });
    return () => {
      requestGeneration.current += 1;
    };
  }, [offset, search, service]);

  const submitSearch = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setOffset(0);
    setSearch(searchInput.trim());
  };
  const page = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="admin-page">
      <header className="page-heading page-heading--actions">
        <div>
          <p className="eyebrow">{t('admin.eyebrow')}</p>
          <h1>{t('projects.title')}</h1>
          <p className="muted">{t('projects.description')}</p>
        </div>
        {canCreate ? (
          <Link className="button button--primary" to="/app/admin/projects/new">
            {t('projects.createAction')}
          </Link>
        ) : null}
      </header>
      <form className="search-row search-row--single" onSubmit={submitSearch}>
        <Field
          label={t('projects.search')}
          maxLength={120}
          name="projectSearch"
          onChange={(event) => {
            setSearchInput(event.target.value);
          }}
          value={searchInput}
        />
        <Button type="submit">{t('projects.searchAction')}</Button>
      </form>
      {error ? <p className="notice notice--error">{error}</p> : null}
      {loading ? <p role="status">{t('common.loading')}</p> : null}
      {!loading && projects.length === 0 ? (
        <section className="panel empty-state">
          <h2>{search ? t('projects.noResults') : t('projects.emptyTitle')}</h2>
          <p>{t('projects.emptyDescription')}</p>
        </section>
      ) : null}
      {!loading && projects.length > 0 ? (
        <>
          <p className="muted">{t('projects.results', { count: total })}</p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('projects.name')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('projects.updatedAt')}</th>
                  <th>{t('projects.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{t(`projects.status.${project.status}`)}</td>
                    <td>{new Date(project.updatedAt).toLocaleString()}</td>
                    <td>
                      <Link to={`/app/admin/projects/${project.id}`}>
                        {t('projects.view')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav
            aria-label={t('projects.paginationLabel')}
            className="pagination"
          >
            <Button
              disabled={offset === 0}
              onClick={() => {
                setLoading(true);
                setOffset(Math.max(0, offset - pageSize));
              }}
            >
              {t('projects.previous')}
            </Button>
            <span>{t('projects.page', { page, pageCount })}</span>
            <Button
              disabled={offset + pageSize >= total}
              onClick={() => {
                setLoading(true);
                setOffset(offset + pageSize);
              }}
            >
              {t('projects.next')}
            </Button>
          </nav>
        </>
      ) : null}
    </section>
  );
}
