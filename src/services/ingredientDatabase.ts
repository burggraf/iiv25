import { VeganStatus } from '../types';

export interface IngredientInfo {
  name: string;
  status: VeganStatus;
  description: string;
  alternatives?: string[];
}

// Comprehensive ingredient database
const ingredientDatabase: { [key: string]: IngredientInfo } = {
  // Definitely NOT VEGETARIAN - Animal products
  'milk': {
    name: 'Milk',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Dairy product from cows. Contains lactose and casein.',
    alternatives: ['Almond milk', 'Oat milk', 'Soy milk', 'Coconut milk']
  },
  'cheese': {
    name: 'Cheese',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Dairy product made from milk. Often contains rennet from animal sources.',
    alternatives: ['Nutritional yeast', 'Cashew cheese', 'Vegan cheese alternatives']
  },
  'butter': {
    name: 'Butter',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Dairy fat from milk.',
    alternatives: ['Vegan butter', 'Coconut oil', 'Olive oil']
  },
  'eggs': {
    name: 'Eggs',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Chicken eggs.',
    alternatives: ['Flax eggs', 'Chia seeds', 'Applesauce', 'Commercial egg replacers']
  },
  'honey': {
    name: 'Honey',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Sweet substance produced by bees.',
    alternatives: ['Maple syrup', 'Agave nectar', 'Date syrup']
  },
  'gelatin': {
    name: 'Gelatin',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Protein derived from animal collagen, usually from bones and skin.',
    alternatives: ['Agar', 'Carrageenan', 'Pectin']
  },
  'lard': {
    name: 'Lard',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Rendered fat from pigs.',
    alternatives: ['Vegetable shortening', 'Coconut oil', 'Vegan butter']
  },
  'beef': {
    name: 'Beef',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Meat from cattle.',
    alternatives: ['Seitan', 'Tempeh', 'Plant-based meat alternatives']
  },
  'chicken': {
    name: 'Chicken',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Poultry meat.',
    alternatives: ['Tofu', 'Jackfruit', 'Plant-based chicken alternatives']
  },
  'pork': {
    name: 'Pork',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Meat from pigs.',
    alternatives: ['Smoky tempeh', 'Mushrooms', 'Plant-based bacon']
  },
  'fish': {
    name: 'Fish',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Seafood.',
    alternatives: ['Seaweed', 'Hearts of palm', 'Plant-based fish alternatives']
  },
  'whey': {
    name: 'Whey',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Protein derived from milk during cheese production.',
    alternatives: ['Pea protein', 'Rice protein', 'Hemp protein']
  },
  'casein': {
    name: 'Casein',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Milk protein.',
    alternatives: ['Plant-based protein powders']
  },
  'lactose': {
    name: 'Lactose',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Sugar found in milk.',
    alternatives: ['Plant-based sugars']
  },
  'carmine': {
    name: 'Carmine',
    status: VeganStatus.NOT_VEGETARIAN,
    description: 'Red dye made from crushed cochineal insects.',
    alternatives: ['Beet juice', 'Plant-based red dyes']
  },

  // VEGAN - Plant-based ingredients
  'wheat': {
    name: 'Wheat',
    status: VeganStatus.VEGAN,
    description: 'Cereal grain used to make flour and bread.',
  },
  'rice': {
    name: 'Rice',
    status: VeganStatus.VEGAN,
    description: 'Staple grain crop.',
  },
  'oats': {
    name: 'Oats',
    status: VeganStatus.VEGAN,
    description: 'Whole grain cereal.',
  },
  'quinoa': {
    name: 'Quinoa',
    status: VeganStatus.VEGAN,
    description: 'Complete protein grain-like seed.',
  },
  'tofu': {
    name: 'Tofu',
    status: VeganStatus.VEGAN,
    description: 'Protein-rich food made from soybeans.',
  },
  'tempeh': {
    name: 'Tempeh',
    status: VeganStatus.VEGAN,
    description: 'Fermented soybean product.',
  },
  'seitan': {
    name: 'Seitan',
    status: VeganStatus.VEGAN,
    description: 'Wheat protein meat substitute.',
  },
  'nutritional yeast': {
    name: 'Nutritional Yeast',
    status: VeganStatus.VEGAN,
    description: 'Deactivated yeast with cheesy flavor and B vitamins.',
  },
  'coconut oil': {
    name: 'Coconut Oil',
    status: VeganStatus.VEGAN,
    description: 'Oil extracted from coconut meat.',
  },
  'olive oil': {
    name: 'Olive Oil',
    status: VeganStatus.VEGAN,
    description: 'Oil pressed from olives.',
  },
  'avocado': {
    name: 'Avocado',
    status: VeganStatus.VEGAN,
    description: 'Nutrient-rich fruit with healthy fats.',
  },
  'almonds': {
    name: 'Almonds',
    status: VeganStatus.VEGAN,
    description: 'Tree nuts rich in protein and healthy fats.',
  },
  'cashews': {
    name: 'Cashews',
    status: VeganStatus.VEGAN,
    description: 'Creamy tree nuts often used in vegan cheese.',
  },
  'chia seeds': {
    name: 'Chia Seeds',
    status: VeganStatus.VEGAN,
    description: 'Omega-3 rich seeds that can replace eggs in baking.',
  },
  'flax seeds': {
    name: 'Flax Seeds',
    status: VeganStatus.VEGAN,
    description: 'Seeds high in omega-3s, can be used as egg replacement.',
  },
  'maple syrup': {
    name: 'Maple Syrup',
    status: VeganStatus.VEGAN,
    description: 'Natural sweetener from maple trees.',
  },
  'agave': {
    name: 'Agave',
    status: VeganStatus.VEGAN,
    description: 'Plant-based sweetener from agave cactus.',
  },
  'coconut milk': {
    name: 'Coconut Milk',
    status: VeganStatus.VEGAN,
    description: 'Creamy milk made from coconut meat.',
  },
  'almond milk': {
    name: 'Almond Milk',
    status: VeganStatus.VEGAN,
    description: 'Plant-based milk made from almonds.',
  },
  'soy milk': {
    name: 'Soy Milk',
    status: VeganStatus.VEGAN,
    description: 'Plant-based milk made from soybeans.',
  },
  'oat milk': {
    name: 'Oat Milk',
    status: VeganStatus.VEGAN,
    description: 'Creamy plant-based milk made from oats.',
  },

  // UNKNOWN - Needs more context
  'natural flavors': {
    name: 'Natural Flavors',
    status: VeganStatus.UNKNOWN,
    description: 'Can be derived from plants or animals. Contact manufacturer for clarification.',
  },
  'vitamin d3': {
    name: 'Vitamin D3',
    status: VeganStatus.UNKNOWN,
    description: 'Can be derived from sheep wool (not vegetarian) or lichen (vegetarian). Check source.',
  },
  'glycerin': {
    name: 'Glycerin',
    status: VeganStatus.UNKNOWN,
    description: 'Can be plant-based or animal-derived. Check source with manufacturer.',
  },
  'lecithin': {
    name: 'Lecithin',
    status: VeganStatus.UNKNOWN,
    description: 'Usually from soy (vegan) but can be from eggs. Check source.',
  },
};

export class IngredientService {
  static searchIngredient(query: string): IngredientInfo | null {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Direct match
    if (ingredientDatabase[normalizedQuery]) {
      return ingredientDatabase[normalizedQuery];
    }
    
    // Partial match
    for (const [key, ingredient] of Object.entries(ingredientDatabase)) {
      if (key.includes(normalizedQuery) || ingredient.name.toLowerCase().includes(normalizedQuery)) {
        return ingredient;
      }
    }
    
    return null;
  }
  
  static getAllIngredients(): IngredientInfo[] {
    return Object.values(ingredientDatabase);
  }
  
  static getIngredientsByStatus(status: VeganStatus): IngredientInfo[] {
    return Object.values(ingredientDatabase).filter(ingredient => ingredient.status === status);
  }
}