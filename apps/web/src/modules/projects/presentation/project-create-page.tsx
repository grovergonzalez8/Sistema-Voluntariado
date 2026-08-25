import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

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
      <header className="page-heading">
        <p className="eyebrow">{t('admin.eyebrow')}</p>
        <h1>{t('projects.createTitle')}</h1>
        <p className="muted">{t('projects.createDescription')}</p>
      </header>
      <ProjectForm
        onSaved={(id) => void navigate(`/app/admin/projects/${id}`)}
        service={service}
      />
    </section>
  );
}
