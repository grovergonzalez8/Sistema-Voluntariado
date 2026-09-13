import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@sistema-voluntariado/ui';

import type { ProjectManagementService } from '../application/project-management-service';
import { ProjectForm } from './project-form';

export function ProjectCreatePage({
  service,
}: {
  readonly service: ProjectManagementService;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <section className="admin-page">
      <PageHeader
        description={t('projects.createDescription')}
        eyebrow={t('admin.eyebrow')}
        title={t('projects.createTitle')}
      />
      <ProjectForm
        onSaved={(id) => void navigate(`/app/admin/projects/${id}`)}
        service={service}
      />
    </section>
  );
}
