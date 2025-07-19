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
          id: string
          input: string
          metadata: Json | null
          result: string | null
          type: string
          userid: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          input: string
          metadata?: Json | null
          result?: string | null
          type: string
          userid: string
        }
        Update: {
          created_at?: string | null
          id?: string
          input?: string
          metadata?: Json | null
          result?: string | null
          type?: string
          userid?: string
        }
        Relationships: []
      }
      ingr: {
        Row: {
          class: string | null
          count: number | null
          title: string | null
        }
        Insert: {
          class?: string | null
          count?: number | null
          title?: string | null
        }
        Update: {
          class?: string | null
          count?: number | null
          title?: string | null
        }
        Relationships: []
      }
      ingr1: {
        Row: {
          class: string
          productcount: number | null
          title: string
        }
        Insert: {
          class: string
          productcount?: number | null
          title: string
        }
        Update: {
          class?: string
          productcount?: number | null
          title?: string
        }
        Relationships: []
      }
      ingr2025_07_16: {
        Row: {
          class: string | null
          count: number | null
          title: string
        }
        Insert: {
          class?: string | null
          count?: number | null
          title: string
        }
        Update: {
          class?: string | null
          count?: number | null
          title?: string
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
          calculated_code: number
          calculated_code_sugar_vegan: number
          calculated_code_sugar_vegetarian: number
          classification: string | null
          created: string
          ean13: string
          gs1cat: string
          imageurl: string | null
          ingredients: string | null
          ingredientsaddedtomasterlist: number | null
          lastupdated: string
          mfg: string | null
          override_code: number
          override_notes: string
          product_name: string | null
          rerun: string | null
          upc: string | null
        }
        Insert: {
          analysis?: string | null
          brand?: string | null
          calculated_code?: number
          calculated_code_sugar_vegan?: number
          calculated_code_sugar_vegetarian?: number
          classification?: string | null
          created?: string
          ean13: string
          gs1cat?: string
          imageurl?: string | null
          ingredients?: string | null
          ingredientsaddedtomasterlist?: number | null
          lastupdated?: string
          mfg?: string | null
          override_code?: number
          override_notes: string
          product_name?: string | null
          rerun?: string | null
          upc?: string | null
        }
        Update: {
          analysis?: string | null
          brand?: string | null
          calculated_code?: number
          calculated_code_sugar_vegan?: number
          calculated_code_sugar_vegetarian?: number
          classification?: string | null
          created?: string
          ean13?: string
          gs1cat?: string
          imageurl?: string | null
          ingredients?: string | null
          ingredientsaddedtomasterlist?: number | null
          lastupdated?: string
          mfg?: string | null
          override_code?: number
          override_notes?: string
          product_name?: string | null
          rerun?: string | null
          upc?: string | null
        }
        Relationships: []
      }
      user_subscription: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          subscription_level: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          subscription_level: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          subscription_level?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
        Args: { action_type: string }
        Returns: {
          subscription_level: string
          rate_limit: number
          recent_searches: number
          is_rate_limited: boolean
          searches_remaining: number
        }[]
      }
      get_subscription_status: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      lookup_product: {
        Args: { barcode: string }
        Returns: {
          ean13: string
          upc: string
          product_name: string
          brand: string
          ingredients: string
          calculated_code: number
          override_code: number
          imageurl: string
          created: string
          lastupdated: string
        }[]
      }
      search_ingredients: {
        Args: { search_term: string }
        Returns: {
          title: string
          class: string
          productcount: number
          lastupdated: string
          created: string
        }[]
      }
      search_product: {
        Args: { barcode: string }
        Returns: {
          id: number
          upc: string
          ean13: string
          product_name: string
          brand: string
          ingredients: string
          calculated_code: string
          override_code: string
          image_url: string
          created_at: string
          updated_at: string
        }[]
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
