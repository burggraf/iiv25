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
}

export enum VeganStatus {
  VEGAN = 'vegan',
  VEGETARIAN = 'vegetarian',
  NOT_VEGAN = 'not_vegan',
  UNKNOWN = 'unknown'
}

// API response types
export interface OpenFoodFactsProduct {
  code: string;
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
    ingredients_text?: string;
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