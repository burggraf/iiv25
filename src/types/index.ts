// Product classification details
export interface ClassificationDetail {
  ingredient: string;
  reason: string;
  verdict: 'vegan' | 'vegetarian' | 'not_vegan' | 'unknown';
}

// Product related types
export interface Product {
  id: string;
  barcode: string;
  name: string;
  brand?: string;
  ingredients: string[];
  veganStatus: VeganStatus;
  imageUrl?: string;
  lastScanned?: Date;
  structuredIngredients?: StructuredIngredient[];
  nonVeganIngredients?: ClassificationDetail[];
  classificationMethod?: 'structured' | 'product-level' | 'text-based';
}

export enum VeganStatus {
  VEGAN = 'vegan',
  VEGETARIAN = 'vegetarian',
  NOT_VEGAN = 'not_vegan',
  UNKNOWN = 'unknown'
}

// Open Food Facts structured ingredient type
export interface StructuredIngredient {
  id: string;
  text: string;
  vegan?: "yes" | "no" | "maybe";
  vegetarian?: "yes" | "no" | "maybe";
  percent_estimate?: number;
  percent_max?: number;
  percent_min?: number;
}

// API response types
export interface OpenFoodFactsProduct {
  code: string;
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
    ingredients_text?: string;
    ingredients?: StructuredIngredient[];
    vegan?: string;
    vegetarian?: string;
    image_url?: string;
    nutriments?: any;
  };
}

// Navigation types
export type RootStackParamList = {
  Home: undefined;
  Scanner: undefined;
  ProductDetail: { product: Product };
  History: undefined;
  Settings: undefined;
};

// Component props
export interface ScannerProps {
  onBarcodeScanned: (barcode: string) => void;
}

export interface ProductCardProps {
  product: Product;
  onPress?: () => void;
}

// Context types
export interface AppContextType {
  scannedProducts: Product[];
  addProduct: (product: Product) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

// Supabase database types
export interface SupabaseIngredient {
  title: string;
  class?: string;
  productcount?: number;
  lastupdated?: string;
  created?: string;
}

export interface SupabaseProduct {
  id: number;
  upc?: string;
  ean13?: string;
  product_name?: string;
  brand?: string;
  ingredients?: string;
  calculated_code?: string;
  override_code?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

// Data source tracking
export type DataSource = 'supabase' | 'openfoodfacts' | 'manual';

// Enhanced product interface with data source
export interface EnhancedProduct extends Product {
  dataSource: DataSource;
  confidenceScore?: number;
}

// Action logging types
export interface ActionLog {
  id: string;
  type: ActionType;
  input: string;
  userid: string;
  created_at: Date;
  result?: string;
  metadata?: Record<string, any>;
}

export enum ActionType {
  SCAN = 'scan',
  PRODUCT_SEARCH = 'product_search',
  INGREDIENT_SEARCH = 'ingredient_search',
  MANUAL_ENTRY = 'manual_entry',
  HISTORY_VIEW = 'history_view',
  SETTINGS_UPDATE = 'settings_update'
}

// Subscription types
export type SubscriptionLevel = 'free' | 'standard' | 'premium';

export interface UserSubscription {
  id: string;
  user_id: string;
  subscription_level: SubscriptionLevel;
  created_at: Date;
  updated_at: Date;
  expires_at?: Date;
  is_active: boolean;
}