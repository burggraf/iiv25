export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      actionlog: {
        Row: {
          created_at: string | null
          deviceid: string | null
          id: string
          input: string
          metadata: Json | null
          result: string | null
          type: string
          userid: string
        }
        Insert: {
          created_at?: string | null
          deviceid?: string | null
          id?: string
          input: string
          metadata?: Json | null
          result?: string | null
          type: string
          userid: string
        }
        Update: {
          created_at?: string | null
          deviceid?: string | null
          id?: string
          input?: string
          metadata?: Json | null
          result?: string | null
          type?: string
          userid?: string
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          class: string | null
          created: string
          lastupdated: string
          primary_class: string | null
          productcount: number
          title: string
        }
        Insert: {
          class?: string | null
          created?: string
          lastupdated?: string
          primary_class?: string | null
          productcount?: number
          title: string
        }
        Update: {
          class?: string | null
          created?: string
          lastupdated?: string
          primary_class?: string | null
          productcount?: number
          title?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          analysis: string | null
          brand: string | null
          classification: string | null
          created: string
          ean13: string
          imageurl: string | null
          ingredients: string | null
          issues: string | null
          lastupdated: string
          mfg: string | null
          product_name: string | null
          upc: string | null
        }
        Insert: {
          analysis?: string | null
          brand?: string | null
          classification?: string | null
          created?: string
          ean13: string
          imageurl?: string | null
          ingredients?: string | null
          issues?: string | null
          lastupdated?: string
          mfg?: string | null
          product_name?: string | null
          upc?: string | null
        }
        Update: {
          analysis?: string | null
          brand?: string | null
          classification?: string | null
          created?: string
          ean13?: string
          imageurl?: string | null
          ingredients?: string | null
          issues?: string | null
          lastupdated?: string
          mfg?: string | null
          product_name?: string | null
          upc?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          subscription_level: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id: string
          is_active?: boolean
          subscription_level?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          subscription_level?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_subscription: {
        Row: {
          created_at: string | null
          deviceid: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          subscription_level: string
          updated_at: string | null
          userid: string | null
        }
        Insert: {
          created_at?: string | null
          deviceid: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          subscription_level: string
          updated_at?: string | null
          userid?: string | null
        }
        Update: {
          created_at?: string | null
          deviceid?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          subscription_level?: string
          updated_at?: string | null
          userid?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_actionlog_paginated: {
        Args: { page_size?: number; page_offset?: number }
        Returns: Json
      }
      admin_actionlog_recent: {
        Args: { limit_count?: number }
        Returns: {
          id: string
          type: string
          input: string
          userid: string
          created_at: string
          result: string
          metadata: Json
          deviceid: string
        }[]
      }
      admin_check_user_access: {
        Args: { user_email: string }
        Returns: boolean
      }
      admin_classify_upc: {
        Args: { upc_code: string }
        Returns: boolean
      }
      admin_create_ingredient: {
        Args: {
          ingredient_title: string
          ingredient_class?: string
          ingredient_primary_class?: string
        }
        Returns: boolean
      }
      admin_delete_ingredient: {
        Args: { ingredient_title: string }
        Returns: boolean
      }
      admin_get_ingredient_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_get_ingredients_for_upc: {
        Args: { product_upc: string }
        Returns: {
          title: string
          class: string
        }[]
      }
      admin_get_product: {
        Args: { product_upc: string }
        Returns: Json
      }
      admin_get_product_stats: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_get_unclassified_ingredients: {
        Args: { page_size?: number; page_offset?: number }
        Returns: Json
      }
      admin_ingredient_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          stat_type: string
          stat_value: string
          count: number
        }[]
      }
      admin_product_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          stat_type: string
          stat_value: string
          count: number
        }[]
      }
      admin_search_ingredients: {
        Args: { query: string; limit_count?: number }
        Returns: {
          title: string
          class: string
          primary_class: string
          productcount: number
          lastupdated: string
          created: string
        }[]
      }
      admin_search_ingredients_exact: {
        Args: { query: string; search_type?: string; limit_count?: number }
        Returns: {
          title: string
          class: string
          primary_class: string
          productcount: number
          lastupdated: string
          created: string
        }[]
      }
      admin_search_ingredients_with_filters: {
        Args: {
          query: string
          search_type?: string
          filter_classes?: string[]
          filter_primary_classes?: string[]
          limit_count?: number
        }
        Returns: {
          title: string
          class: string
          primary_class: string
          productcount: number
          lastupdated: string
          created: string
        }[]
      }
      admin_search_ingredients_with_filters_paginated: {
        Args: {
          query: string
          search_type?: string
          filter_classes?: string[]
          filter_primary_classes?: string[]
          page_size?: number
          page_offset?: number
        }
        Returns: Json
      }
      admin_search_products: {
        Args: { query: string; limit_count?: number }
        Returns: {
          product_name: string
          brand: string
          upc: string
          ean13: string
          ingredients: string
          analysis: string
          classification: string
          lastupdated: string
          created: string
          mfg: string
          imageurl: string
          issues: string
        }[]
      }
      admin_update_ingredient: {
        Args: {
          ingredient_title: string
          new_class?: string
          new_primary_class?: string
        }
        Returns: boolean
      }
      admin_update_product: {
        Args: { product_upc: string; updates: Json }
        Returns: boolean
      }
      admin_update_user_subscription: {
        Args: { subscription_id: string; updates: Json }
        Returns: boolean
      }
      admin_user_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          stat_type: string
          count: number
        }[]
      }
      admin_user_subscription_search: {
        Args: { query?: string; limit_count?: number }
        Returns: {
          id: string
          user_id: string
          subscription_level: string
          created_at: string
          updated_at: string
          expires_at: string
          is_active: boolean
        }[]
      }
      classify_all_products: {
        Args: Record<PropertyKey, never>
        Returns: {
          upc_code: string
          old_classification: string
          new_classification: string
        }[]
      }
      classify_upc: {
        Args: { input_upc: string }
        Returns: string
      }
      get_classes_for_upc: {
        Args: { input_upc: string }
        Returns: {
          class: string
        }[]
      }
      get_ingredients_for_upc: {
        Args: { input_upc: string }
        Returns: {
          title: string
          class: string
        }[]
      }
      get_primary_classes_for_upc: {
        Args: { input_upc: string }
        Returns: {
          primary_class: string
        }[]
      }
      get_rate_limits: {
        Args: { action_type: string; device_id?: string }
        Returns: {
          subscription_level: string
          rate_limit: number
          recent_searches: number
          is_rate_limited: boolean
          searches_remaining: number
        }[]
      }
      get_subscription_status: {
        Args: { device_id_param: string }
        Returns: Json
      }
      get_usage_stats: {
        Args: { device_id_param: string }
        Returns: {
          product_lookups_today: number
          product_lookups_limit: number
          searches_today: number
          searches_limit: number
        }[]
      }
      lookup_product: {
        Args: { barcode: string; device_id: string }
        Returns: {
          ean13: string
          upc: string
          product_name: string
          brand: string
          ingredients: string
          classification: string
          imageurl: string
          issues: string
          created: string
          lastupdated: string
        }[]
      }
      search_ingredients: {
        Args:
          | { search_term: string }
          | { search_term: string; device_id: string }
        Returns: {
          title: string
          class: string
          productcount: number
          lastupdated: string
          created: string
        }[]
      }
      update_subscription: {
        Args: {
          device_id_param: string
          subscription_level_param: string
          expires_at_param?: string
          is_active_param?: boolean
        }
        Returns: boolean
      }
      update_user_subscription_userid: {
        Args: { device_id_param: string; new_user_id?: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
