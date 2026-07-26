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
      bot_admin_events: {
        Row: {
          actor_id: number | null
          actor_name: string | null
          actor_username: string | null
          chat_id: number
          chat_title: string | null
          chat_type: string | null
          chat_username: string | null
          created_at: string
          deep_link: string | null
          id: string
          new_status: string | null
          old_status: string | null
          reason: string | null
        }
        Insert: {
          actor_id?: number | null
          actor_name?: string | null
          actor_username?: string | null
          chat_id: number
          chat_title?: string | null
          chat_type?: string | null
          chat_username?: string | null
          created_at?: string
          deep_link?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          reason?: string | null
        }
        Update: {
          actor_id?: number | null
          actor_name?: string | null
          actor_username?: string | null
          chat_id?: number
          chat_title?: string | null
          chat_type?: string | null
          chat_username?: string | null
          created_at?: string
          deep_link?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      broadcast_drafts: {
        Row: {
          auto_delete_seconds: number | null
          awaiting_custom: string | null
          editing_broadcast_id: string | null
          mode: string
          preview_text: string | null
          scheduled_at: string | null
          selected_chat_ids: number[]
          source_chat_id: number | null
          source_message_id: number | null
          source_message_json: Json | null
          step: string
          updated_at: string
          user_id: number
        }
        Insert: {
          auto_delete_seconds?: number | null
          awaiting_custom?: string | null
          editing_broadcast_id?: string | null
          mode?: string
          preview_text?: string | null
          scheduled_at?: string | null
          selected_chat_ids?: number[]
          source_chat_id?: number | null
          source_message_id?: number | null
          source_message_json?: Json | null
          step?: string
          updated_at?: string
          user_id: number
        }
        Update: {
          auto_delete_seconds?: number | null
          awaiting_custom?: string | null
          editing_broadcast_id?: string | null
          mode?: string
          preview_text?: string | null
          scheduled_at?: string | null
          selected_chat_ids?: number[]
          source_chat_id?: number | null
          source_message_id?: number | null
          source_message_json?: Json | null
          step?: string
          updated_at?: string
          user_id?: number
        }
        Relationships: []
      }
      broadcast_targets: {
        Row: {
          broadcast_id: string
          chat_id: number
          chat_title: string | null
          created_at: string
          delete_at: string | null
          deleted_at: string | null
          error: string | null
          id: string
          sent_message_id: number | null
          status: string
          updated_at: string
        }
        Insert: {
          broadcast_id: string
          chat_id: number
          chat_title?: string | null
          created_at?: string
          delete_at?: string | null
          deleted_at?: string | null
          error?: string | null
          id?: string
          sent_message_id?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          broadcast_id?: string
          chat_id?: number
          chat_title?: string | null
          created_at?: string
          delete_at?: string | null
          deleted_at?: string | null
          error?: string | null
          id?: string
          sent_message_id?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_targets_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_templates: {
        Row: {
          created_at: string
          id: string
          mode: string
          name: string
          preview_text: string | null
          source_chat_id: number
          source_message_id: number
          updated_at: string
          user_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          name: string
          preview_text?: string | null
          source_chat_id: number
          source_message_id: number
          updated_at?: string
          user_id: number
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          name?: string
          preview_text?: string | null
          source_chat_id?: number
          source_message_id?: number
          updated_at?: string
          user_id?: number
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          auto_delete_seconds: number | null
          created_at: string
          created_by: number
          created_by_name: string | null
          id: string
          mode: string
          preview_text: string | null
          scheduled_at: string | null
          sent_at: string | null
          source_chat_id: number
          source_message_id: number
          status: string
          updated_at: string
        }
        Insert: {
          auto_delete_seconds?: number | null
          created_at?: string
          created_by: number
          created_by_name?: string | null
          id?: string
          mode?: string
          preview_text?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          source_chat_id: number
          source_message_id: number
          status?: string
          updated_at?: string
        }
        Update: {
          auto_delete_seconds?: number | null
          created_at?: string
          created_by?: number
          created_by_name?: string | null
          id?: string
          mode?: string
          preview_text?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          source_chat_id?: number
          source_message_id?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_lists: {
        Row: {
          added_by: number | null
          added_by_name: string | null
          category: string
          chat_id: number
          created_at: string
        }
        Insert: {
          added_by?: number | null
          added_by_name?: string | null
          category: string
          chat_id: number
          created_at?: string
        }
        Update: {
          added_by?: number | null
          added_by_name?: string | null
          category?: string
          chat_id?: number
          created_at?: string
        }
        Relationships: []
      }
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
          created_at: string
          first_name: string | null
          role: Database["public"]["Enums"]["bot_admin_role"]
          user_id: number
          username: string | null
        }
        Insert: {
          added_by?: number | null
          added_by_name?: string | null
          created_at?: string
          first_name?: string | null
          role?: Database["public"]["Enums"]["bot_admin_role"]
          user_id: number
          username?: string | null
        }
        Update: {
          added_by?: number | null
          added_by_name?: string | null
          created_at?: string
          first_name?: string | null
          role?: Database["public"]["Enums"]["bot_admin_role"]
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
          reactions_enabled: boolean
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
          reactions_enabled?: boolean
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
          reactions_enabled?: boolean
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
      bot_admin_role: "super_admin" | "admin"
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
      bot_admin_role: ["super_admin", "admin"],
    },
  },
} as const
