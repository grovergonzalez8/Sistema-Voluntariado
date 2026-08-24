import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import type { ProjectManagementService } from '../application/project-management-service';
import type { Project } from '../domain/project';
import { ProjectForm } from './project-form';

export function ProjectEditPage({
  service,
}: {
  readonly service: ProjectManagementService;
}) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    void service.getProject(id).then((result) => {
      if (!active) return;
      if (result.ok) setProject(result.value);
      else setError(result.error.message);
    });
    return () => {
      active = false;
    };
  }, [id, service]);

  if (error) return <p className="notice notice--error">{error}</p>;
  if (!project) return <p role="status">{t('common.loading')}</p>;
  return (
    <section className="admin-page">
      <header className="page-heading">
        <p className="eyebrow">{t('admin.eyebrow')}</p>
        <h1>{t('projects.editTitle')}</h1>
      </header>
      <ProjectForm
        initialValue={{
          description: project.description ?? '',
          name: project.name,
        }}
        onSaved={(projectId) =>
          void navigate(`/app/admin/projects/${projectId}`)
        }
        projectId={id}
        service={service}
      />
    </section>
  );
}
