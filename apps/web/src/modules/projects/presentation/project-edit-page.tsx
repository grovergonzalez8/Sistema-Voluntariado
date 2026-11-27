import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import {
  Button,
  LoadingState,
  Notice,
  PageHeader,
} from '@sistema-voluntariado/ui';

import type { ProjectManagementService } from '../application/project-management-service';
import type { Project } from '../domain/project';
import { ProjectForm } from './project-form';

export function ProjectEditPage({
  service,
}: {
  readonly service: ProjectManagementService;
}) {
  const { id = '' } = useParams();
  return <ProjectEditPageForResource id={id} key={id} service={service} />;
}

function ProjectEditPageForResource({
  id,
  service,
}: {
  readonly id: string;
  readonly service: ProjectManagementService;
}) {
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    void service.getProject(id).then(
      (result) => {
        if (!active) return;
        if (result.ok && result.value.id === id) {
          setProject(result.value);
          setError(null);
        } else {
          setProject(null);
          setError(
            result.ok ? t('common.resourceLoadError') : result.error.message,
          );
        }
      },
      () => {
        if (!active) return;
        setProject(null);
        setError(t('common.resourceLoadError'));
      },
    );
    return () => {
      active = false;
    };
  }, [id, service, loadAttempt, t]);

  if (error)
    return (
      <section>
        <Notice tone="error">{error}</Notice>
        <Button
          onClick={() => {
            setError(null);
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          {t('common.retry')}
        </Button>
      </section>
    );
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
        projectId={project.id}
        service={service}
      />
    </section>
  );
}
