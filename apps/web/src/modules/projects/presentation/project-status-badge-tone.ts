import type { ProjectStatus } from '../domain/project';
import type { ProjectActivityStatus } from '../domain/project-activity';

type StatusTone = 'danger' | 'info' | 'neutral' | 'success' | 'warning';

export function getProjectStatusTone(status: ProjectStatus): StatusTone {
  switch (status) {
    case 'active':
      return 'success';
    case 'closed':
      return 'neutral';
  }
}

export function getProjectActivityStatusTone(
  status: ProjectActivityStatus,
): StatusTone {
  switch (status) {
    case 'scheduled':
      return 'info';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
  }
}
