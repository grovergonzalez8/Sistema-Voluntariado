export const projectActivityAttendanceStatuses = ['present', 'absent'] as const;

export type ProjectActivityAttendanceStatus =
  (typeof projectActivityAttendanceStatuses)[number];

export interface ProjectActivityAttendance {
  readonly createdAt: string;
  readonly participationId: string;
  readonly status: ProjectActivityAttendanceStatus;
  readonly updatedAt: string;
}
