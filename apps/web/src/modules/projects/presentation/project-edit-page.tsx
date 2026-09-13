import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { LoadingState, Notice, PageHeader } from '@sistema-voluntariado/ui';

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

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!project) return <LoadingState>{t('common.loading')}</LoadingState>;
  return (
    <section className="admin-page">
      <PageHeader
        description={project.name}
        eyebrow={t('admin.eyebrow')}
        title={t('projects.editTitle')}
      />
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
