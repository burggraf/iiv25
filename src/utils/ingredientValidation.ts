import { ParseIngredientsResponse } from '../services/ingredientOCRService';

export interface IngredientValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Validates ingredient parsing results from OCR service
 * Checks for basic errors, confidence threshold, and valid ingredient list
 */
export function validateIngredientParsingResult(
  data: ParseIngredientsResponse,
  confidenceThreshold: number = 0.9
): IngredientValidationResult {
  // Check for API errors first
  if (data.error) {
    return {
      isValid: false,
      errorMessage: data.error,
    };
  }

  // Check confidence threshold and validity
  if (!data.isValidIngredientsList || data.confidence < confidenceThreshold) {
    const confidencePercentage = Math.round(data.confidence * 100);
    return {
      isValid: false,
      errorMessage: `Photo quality too low (${confidencePercentage}% confidence). Please try again with better lighting.`,
    };
  }

  // Check if ingredients were actually extracted
  if (!data.ingredients || data.ingredients.length === 0) {
    return {
      isValid: false,
      errorMessage: 'No ingredients could be extracted from the image. Please try again with better lighting.',
    };
  }

  return {
    isValid: true,
  };
}