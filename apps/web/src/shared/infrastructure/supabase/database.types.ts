export interface Database {
  public: {
    CompositeTypes: Record<string, never>;
    Enums: Record<string, never>;
    Functions: {
      has_permission: {
        Args: { requested_permission: string };
        Returns: boolean;
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
