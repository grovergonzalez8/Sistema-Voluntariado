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
      manage_account_role: {
        Args: {
          requested_account_id: string;
          requested_operation: string;
          requested_role_code: string;
        };
        Returns: AccountRow[];
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
    };
    Views: Record<string, never>;
  };
}
