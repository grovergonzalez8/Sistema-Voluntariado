export type Json =
  | boolean
  | null
  | number
  | string
  | { readonly [key: string]: Json | undefined }
  | readonly Json[];

interface AccountRow {
  auth_user_id: string | null;
  authority_version: number;
  created_at: string;
  id: string;
  origin_invited_by: string | null;
  status: 'active' | 'archived' | 'invited' | 'pending_profile' | 'suspended';
  status_changed_at: string;
  updated_at: string;
}

interface VolunteerProjectionRow {
  [key: string]: unknown;
  created_at: string;
  email: string | null;
  full_name: string;
  id: string;
  phone: string | null;
  updated_at: string;
}

interface VolunteerTableRow extends VolunteerProjectionRow {
  phone_match_key: string | null;
}

interface ProjectProjectionRow {
  [key: string]: unknown;
  created_at: string;
  description: string | null;
  id: string;
  name: string;
  status: 'active' | 'closed';
  updated_at: string;
}

interface ProjectAssignmentProjectionRow {
  assignment_id: string;
  created_at: string;
  ended_at: string | null;
  project_id: string;
  started_at: string;
  updated_at: string;
  volunteer_id: string;
  volunteer_name: string;
}

interface ProjectManagerAssignmentProjectionRow {
  assignment_id: string;
  created_at: string;
  ended_at: string | null;
  manager_account_id: string;
  manager_display_name: string;
  project_id: string;
  started_at: string;
  updated_at: string;
}

interface ProjectActivityProjectionRow {
  [key: string]: unknown;
  created_at: string;
  description: string | null;
  ends_at: string | null;
  id: string;
  location_text: string | null;
  name: string;
  project_id: string;
  starts_at: string;
  status: 'cancelled' | 'completed' | 'scheduled';
  status_changed_at: string;
  updated_at: string;
}

interface ProjectActivityParticipationProjectionRow {
  activity_id: string;
  created_at: string;
  ended_at: string | null;
  participation_id: string;
  started_at: string;
  updated_at: string;
  volunteer_id: string;
  volunteer_name: string;
}

export interface Database {
  public: {
    CompositeTypes: Record<string, never>;
    Enums: Record<string, never>;
    Functions: {
      accept_current_account_invitation: {
        Args: Record<string, never>;
        Returns: {
          account_id: string;
          account_status: 'pending_profile';
        }[];
      };
      accept_current_account_invitation_v2: {
        Args: Record<string, never>;
        Returns: {
          account_id: string;
          account_status: 'pending_profile';
        }[];
      };
      accept_current_account_invitation_v3: {
        Args: { requested_acceptance_challenge: string };
        Returns: {
          account_id: string;
          account_status: 'pending_profile';
        }[];
      };
      change_account_status: {
        Args: {
          requested_account_id: string;
          requested_reason: string;
          requested_status: string;
        };
        Returns: AccountRow[];
      };
      assign_project_manager: {
        Args: {
          requested_manager_account_id: string;
          requested_project_id: string;
        };
        Returns: ProjectManagerAssignmentProjectionRow[];
      };
      assign_volunteer_to_project: {
        Args: {
          requested_project_id: string;
          requested_volunteer_id: string;
        };
        Returns: ProjectAssignmentProjectionRow[];
      };
      close_project: {
        Args: { requested_project_id: string };
        Returns: ProjectProjectionRow[];
      };
      cancel_project_activity: {
        Args: {
          requested_activity_id: string;
          requested_project_id: string;
        };
        Returns: ProjectActivityProjectionRow[];
      };
      complete_project_activity: {
        Args: {
          requested_activity_id: string;
          requested_project_id: string;
        };
        Returns: ProjectActivityProjectionRow[];
      };
      complete_current_account_profile: {
        Args: {
          requested_display_name: string;
          requested_locale: string;
        };
        Returns: { account_id: string; account_status: 'active' }[];
      };
      complete_current_account_profile_v2: {
        Args: {
          requested_display_name: string;
          requested_locale: string;
        };
        Returns: { account_id: string; account_status: 'active' }[];
      };
      create_project: {
        Args: {
          requested_description: string | null;
          requested_name: string;
        };
        Returns: ProjectProjectionRow[];
      };
      create_project_activity: {
        Args: {
          requested_description: string | null;
          requested_ends_at: string | null;
          requested_location_text: string | null;
          requested_name: string;
          requested_project_id: string;
          requested_starts_at: string;
        };
        Returns: ProjectActivityProjectionRow[];
      };
      create_project_activity_participation: {
        Args: {
          requested_activity_id: string;
          requested_project_id: string;
          requested_volunteer_id: string;
        };
        Returns: ProjectActivityParticipationProjectionRow[];
      };
      finish_project_activity_participation: {
        Args: {
          requested_activity_id: string;
          requested_participation_id: string;
          requested_project_id: string;
        };
        Returns: ProjectActivityParticipationProjectionRow[];
      };
      finish_project_volunteer_assignment: {
        Args: { requested_assignment_id: string };
        Returns: ProjectAssignmentProjectionRow[];
      };
      finish_project_manager_assignment: {
        Args: { requested_assignment_id: string };
        Returns: ProjectManagerAssignmentProjectionRow[];
      };
      get_account_detail: {
        Args: { requested_account_id: string };
        Returns: {
          account_id: string;
          account_status: string;
          audit: Json;
          display_name: string | null;
          email: string | null;
          grantable_roles: Json;
          history: Json;
          roles: string[];
          updated_at: string;
          user_id: string | null;
        }[];
      };
      get_account_invitation_detail: {
        Args: { requested_invitation_id: string };
        Returns: {
          account_id: string;
          created_at: string;
          created_by: string;
          display_name: string | null;
          expires_at: string;
          id: string;
          normalized_email: string;
          preferred_locale: string;
          requested_initial_role_code: string;
          sent_at: string | null;
          status: string;
          superseded_by: string | null;
        }[];
      };
      get_my_account_context: {
        Args: Record<string, never>;
        Returns: {
          account_id: string;
          account_status: string;
          authority_version: number;
          permissions: string[];
        }[];
      };
      get_project_detail: {
        Args: { requested_project_id: string };
        Returns: ProjectProjectionRow[];
      };
      get_project_activity_detail: {
        Args: {
          requested_activity_id: string;
          requested_project_id: string;
        };
        Returns: ProjectActivityProjectionRow[];
      };
      has_permission: {
        Args: { requested_permission: string };
        Returns: boolean;
      };
      list_account_invitations: {
        Args: Record<string, never>;
        Returns: {
          account_id: string;
          created_at: string;
          created_by: string;
          display_name: string | null;
          expires_at: string;
          id: string;
          normalized_email: string;
          preferred_locale: string;
          requested_initial_role_code: string;
          sent_at: string | null;
          status: string;
          superseded_by: string | null;
        }[];
      };
      list_accounts: {
        Args: {
          requested_limit?: number;
          requested_offset?: number;
          requested_search?: string;
        };
        Returns: {
          account_id: string;
          account_status: string;
          display_name: string | null;
          email: string | null;
          roles: string[];
          updated_at: string;
          user_id: string | null;
        }[];
      };
      list_project_assignments: {
        Args: { requested_project_id: string };
        Returns: ProjectAssignmentProjectionRow[];
      };
      list_project_activities: {
        Args: { requested_project_id: string };
        Returns: ProjectActivityProjectionRow[];
      };
      list_project_activity_participations: {
        Args: {
          requested_activity_id: string;
          requested_project_id: string;
        };
        Returns: ProjectActivityParticipationProjectionRow[];
      };
      list_project_manager_assignments: {
        Args: { requested_project_id: string };
        Returns: ProjectManagerAssignmentProjectionRow[];
      };
      list_projects: {
        Args: {
          requested_limit?: number;
          requested_offset?: number;
          requested_search?: string;
        };
        Returns: {
          created_at: string;
          description: string | null;
          name: string;
          project_id: string;
          status: 'active' | 'closed';
          total_count: number;
          updated_at: string;
        }[];
      };
      list_volunteer_projects: {
        Args: { requested_volunteer_id: string };
        Returns: {
          assignment_id: string;
          ended_at: string | null;
          project_id: string;
          project_name: string;
          project_status: 'active' | 'closed';
          started_at: string;
        }[];
      };
      search_project_manager_candidates: {
        Args: {
          requested_limit?: number;
          requested_project_id: string;
          requested_search?: string;
        };
        Returns: {
          display_name: string;
          manager_account_id: string;
        }[];
      };
      create_volunteer: {
        Args: {
          accept_potential_duplicate?: boolean;
          requested_email: string | null;
          requested_full_name: string;
          requested_phone: string | null;
        };
        Returns: VolunteerProjectionRow[];
      };
      export_volunteers: {
        Args: {
          requested_limit?: number;
          requested_offset?: number;
          requested_search?: string;
          requested_sort?: string;
        };
        Returns: {
          created_at: string;
          email: string | null;
          full_name: string;
          phone: string | null;
          updated_at: string;
          volunteer_id: string;
        }[];
      };
      find_volunteer_duplicates: {
        Args: {
          requested_email: string | null;
          requested_exclude_id?: string | null;
          requested_phone: string | null;
        };
        Returns: {
          full_name: string;
          matched_fields: string[];
          volunteer_id: string;
        }[];
      };
      get_volunteer_detail: {
        Args: { requested_volunteer_id: string };
        Returns: VolunteerProjectionRow[];
      };
      import_volunteers: {
        Args: { requested_rows: Json };
        Returns: { batch_id: string; inserted_count: number }[];
      };
      list_volunteers: {
        Args: {
          requested_limit?: number;
          requested_offset?: number;
          requested_search?: string;
          requested_sort?: string;
        };
        Returns: {
          created_at: string;
          email: string | null;
          full_name: string;
          phone: string | null;
          total_count: number;
          updated_at: string;
          volunteer_id: string;
        }[];
      };
      preview_volunteer_import_duplicates: {
        Args: { requested_rows: Json };
        Returns: {
          full_name: string;
          matched_fields: string[];
          requested_row_number: number;
          volunteer_id: string;
        }[];
      };
      search_project_volunteer_candidates: {
        Args: {
          requested_limit?: number;
          requested_project_id: string;
          requested_search?: string;
        };
        Returns: { full_name: string; volunteer_id: string }[];
      };
      search_project_activity_volunteer_candidates: {
        Args: {
          requested_activity_id: string;
          requested_limit?: number;
          requested_project_id: string;
          requested_query?: string;
        };
        Returns: { volunteer_id: string; volunteer_name: string }[];
      };
      manage_account_role: {
        Args: {
          requested_account_id: string;
          requested_operation: string;
          requested_role_code: string;
        };
        Returns: AccountRow[];
      };
      update_volunteer: {
        Args: {
          accept_potential_duplicate?: boolean;
          requested_email: string | null;
          requested_full_name: string;
          requested_phone: string | null;
          requested_volunteer_id: string;
        };
        Returns: VolunteerProjectionRow[];
      };
      update_project: {
        Args: {
          requested_description: string | null;
          requested_name: string;
          requested_project_id: string;
        };
        Returns: ProjectProjectionRow[];
      };
      update_project_activity: {
        Args: {
          requested_activity_id: string;
          requested_description: string | null;
          requested_ends_at: string | null;
          requested_location_text: string | null;
          requested_name: string;
          requested_project_id: string;
          requested_starts_at: string;
        };
        Returns: ProjectActivityProjectionRow[];
      };
    };
    Tables: {
      project_activity_participations: {
        Insert: {
          activity_id: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          started_at?: string;
          updated_at?: string;
          volunteer_id: string;
        };
        Relationships: [];
        Row: {
          activity_id: string;
          created_at: string;
          ended_at: string | null;
          id: string;
          started_at: string;
          updated_at: string;
          volunteer_id: string;
        };
        Update: {
          activity_id?: string;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          started_at?: string;
          updated_at?: string;
          volunteer_id?: string;
        };
      };
      project_activities: {
        Insert: {
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          location_text?: string | null;
          name: string;
          project_id: string;
          starts_at: string;
          status?: 'cancelled' | 'completed' | 'scheduled';
          status_changed_at?: string;
          updated_at?: string;
        };
        Relationships: [];
        Row: ProjectActivityProjectionRow;
        Update: {
          created_at?: string;
          description?: string | null;
          ends_at?: string | null;
          id?: string;
          location_text?: string | null;
          name?: string;
          project_id?: string;
          starts_at?: string;
          status?: 'cancelled' | 'completed' | 'scheduled';
          status_changed_at?: string;
          updated_at?: string;
        };
      };
      project_manager_assignments: {
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          manager_account_id: string;
          project_id: string;
          started_at?: string;
          updated_at?: string;
        };
        Relationships: [];
        Row: {
          created_at: string;
          ended_at: string | null;
          id: string;
          manager_account_id: string;
          project_id: string;
          started_at: string;
          updated_at: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          manager_account_id?: string;
          project_id?: string;
          started_at?: string;
          updated_at?: string;
        };
      };
      project_volunteer_assignments: {
        Insert: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          project_id: string;
          started_at?: string;
          updated_at?: string;
          volunteer_id: string;
        };
        Relationships: [];
        Row: {
          created_at: string;
          ended_at: string | null;
          id: string;
          project_id: string;
          started_at: string;
          updated_at: string;
          volunteer_id: string;
        };
        Update: {
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          project_id?: string;
          started_at?: string;
          updated_at?: string;
          volunteer_id?: string;
        };
      };
      projects: {
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          status?: 'active' | 'closed';
          updated_at?: string;
        };
        Relationships: [];
        Row: ProjectProjectionRow;
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          status?: 'active' | 'closed';
          updated_at?: string;
        };
      };
      profiles: {
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          preferred_locale?: 'en' | 'es';
          updated_at?: string;
        };
        Relationships: [];
        Row: {
          archived_at: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          preferred_locale: 'en' | 'es';
          updated_at: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          preferred_locale?: 'en' | 'es';
          updated_at?: string;
        };
      };
      volunteers: {
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          phone?: string | null;
          phone_match_key?: never;
          updated_at?: string;
        };
        Relationships: [];
        Row: VolunteerTableRow;
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          phone?: string | null;
          phone_match_key?: never;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
  };
}
