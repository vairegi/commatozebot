export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      moderation_actions: {
        Row: {
          action: string
          actor: string | null
          actor_telegram_id: number | null
          chat_id: number
          created_at: string
          id: string
          reason: string | null
          target_name: string | null
          target_user_id: number
        }
        Insert: {
          action: string
          actor?: string | null
          actor_telegram_id?: number | null
          chat_id: number
          created_at?: string
          id?: string
          reason?: string | null
          target_name?: string | null
          target_user_id: number
        }
        Update: {
          action?: string
          actor?: string | null
          actor_telegram_id?: number | null
          chat_id?: number
          created_at?: string
          id?: string
          reason?: string | null
          target_name?: string | null
          target_user_id?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      telegram_bot_admins: {
        Row: {
          added_by: number | null
          added_by_name: string | null
          chat_id: number
          created_at: string
          first_name: string | null
          id: string
          user_id: number
          username: string | null
        }
        Insert: {
          added_by?: number | null
          added_by_name?: string | null
          chat_id: number
          created_at?: string
          first_name?: string | null
          id?: string
          user_id: number
          username?: string | null
        }
        Update: {
          added_by?: number | null
          added_by_name?: string | null
          chat_id?: number
          created_at?: string
          first_name?: string | null
          id?: string
          user_id?: number
          username?: string | null
        }
        Relationships: []
      }
      telegram_chats: {
        Row: {
          chat_id: number
          first_seen_at: string
          last_activity_at: string
          member_count: number | null
          rules: string | null
          title: string | null
          type: string | null
          username: string | null
          welcome_enabled: boolean
          welcome_message: string | null
        }
        Insert: {
          chat_id: number
          first_seen_at?: string
          last_activity_at?: string
          member_count?: number | null
          rules?: string | null
          title?: string | null
          type?: string | null
          username?: string | null
          welcome_enabled?: boolean
          welcome_message?: string | null
        }
        Update: {
          chat_id?: number
          first_seen_at?: string
          last_activity_at?: string
          member_count?: number | null
          rules?: string | null
          title?: string | null
          type?: string | null
          username?: string | null
          welcome_enabled?: boolean
          welcome_message?: string | null
        }
        Relationships: []
      }
      telegram_members: {
        Row: {
          chat_id: number
          first_name: string | null
          is_bot: boolean
          joined_at: string
          last_name: string | null
          last_seen_at: string
          message_count: number
          status: string
          user_id: number
          username: string | null
          warn_count: number
        }
        Insert: {
          chat_id: number
          first_name?: string | null
          is_bot?: boolean
          joined_at?: string
          last_name?: string | null
          last_seen_at?: string
          message_count?: number
          status?: string
          user_id: number
          username?: string | null
          warn_count?: number
        }
        Update: {
          chat_id?: number
          first_name?: string | null
          is_bot?: boolean
          joined_at?: string
          last_name?: string | null
          last_seen_at?: string
          message_count?: number
          status?: string
          user_id?: number
          username?: string | null
          warn_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "telegram_members_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "telegram_chats"
            referencedColumns: ["chat_id"]
          },
        ]
      }
      telegram_messages: {
        Row: {
          chat_id: number | null
          created_at: string
          message_id: number | null
          raw_update: Json
          text: string | null
          update_id: number
          user_id: number | null
        }
        Insert: {
          chat_id?: number | null
          created_at?: string
          message_id?: number | null
          raw_update: Json
          text?: string | null
          update_id: number
          user_id?: number | null
        }
        Update: {
          chat_id?: number | null
          created_at?: string
          message_id?: number | null
          raw_update?: Json
          text?: string | null
          update_id?: number
          user_id?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
