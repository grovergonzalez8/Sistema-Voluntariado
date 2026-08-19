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
      change_account_status: {
        Args: {
          requested_account_id: string;
          requested_reason: string;
          requested_status: string;
        };
        Returns: AccountRow[];
      };
      complete_current_account_profile: {
        Args: {
          requested_display_name: string;
          requested_locale: string;
        };
        Returns: { account_id: string; account_status: 'active' }[];
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
    };
    Tables: {
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
