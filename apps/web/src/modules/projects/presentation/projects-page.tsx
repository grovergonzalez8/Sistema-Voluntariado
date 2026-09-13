import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  Button,
  EmptyState,
  Field,
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
  TableRegion,
} from '@sistema-voluntariado/ui';

import type { ProjectManagementService } from '../application/project-management-service';
import type { Project } from '../domain/project';
import { getProjectStatusTone } from './project-status-badge-tone';

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
      <PageHeader
        actions={
          canCreate ? (
            <Link
              className="button button--primary"
              to="/app/admin/projects/new"
            >
              {t('projects.createAction')}
            </Link>
          ) : null
        }
        description={t('projects.description')}
        eyebrow={t('admin.eyebrow')}
        title={t('projects.title')}
      />
      <form
        className="search-row search-row--single toolbar-form"
        onSubmit={submitSearch}
      >
        <Field
          label={t('projects.search')}
          maxLength={120}
          name="projectSearch"
          onChange={(event) => {
            setSearchInput(event.target.value);
          }}
          value={searchInput}
        />
        <Button type="submit" variant="primary">
          {t('projects.searchAction')}
        </Button>
      </form>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {loading ? <LoadingState>{t('common.loading')}</LoadingState> : null}
      {!loading && projects.length === 0 ? (
        <EmptyState
          description={t('projects.emptyDescription')}
          title={search ? t('projects.noResults') : t('projects.emptyTitle')}
        />
      ) : null}
      {!loading && projects.length > 0 ? (
        <>
          <p className="muted">{t('projects.results', { count: total })}</p>
          <TableRegion aria-label={t('projects.title')}>
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
                    <td className="table-primary-cell">{project.name}</td>
                    <td>
                      <StatusBadge tone={getProjectStatusTone(project.status)}>
                        {t(`projects.status.${project.status}`)}
                      </StatusBadge>
                    </td>
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
          </TableRegion>
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
