import axios from 'axios'
import { OpenFoodFactsService } from '../openFoodFactsApi'
import { VeganStatus, StructuredIngredient, OpenFoodFactsProduct } from '../../types'
import { ProductImageUrlService } from '../productImageUrlService'

// Mock external dependencies
jest.mock('axios')
jest.mock('../productImageUrlService')

const mockAxios = axios as jest.Mocked<typeof axios>
const mockProductImageUrlService = ProductImageUrlService as jest.Mocked<typeof ProductImageUrlService>

describe('OpenFoodFactsService', () => {
  const mockBarcode = '1234567890123'

  beforeEach(() => {
    jest.clearAllMocks()
    // Mock console to avoid noise
    jest.spyOn(console, 'error').mockImplementation(() => {})
    
    // Setup default mock for image URL service
    mockProductImageUrlService.resolveImageUrl.mockReturnValue('https://resolved.example.com/image.jpg')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('getProductByBarcode', () => {
    it('should return null when product is not found', async () => {
      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 0,
        product: undefined
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result).toBeNull()
      expect(mockAxios.get).toHaveBeenCalledWith(`https://world.openfoodfacts.org/api/v0/product/${mockBarcode}.json`)
    })

    it('should return null when API request fails', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network error'))

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith('Error fetching product from Open Food Facts:', expect.any(Error))
    })

    it('should return a complete product when found with all data', async () => {
      const mockProduct = {
        product_name: 'Test Vegan Product',
        brands: 'Test Brand',
        ingredients_text: 'water, salt, sugar',
        vegan: 'yes',
        vegetarian: 'yes',
        image_url: 'https://example.com/image.jpg',
        ingredients: []
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result).toBeDefined()
      expect(result?.id).toBe(mockBarcode)
      expect(result?.barcode).toBe(mockBarcode)
      expect(result?.name).toBe('Test Vegan Product')
      expect(result?.brand).toBe('Test Brand')
      expect(result?.ingredients).toEqual(['water', 'salt', 'sugar'])
      expect(result?.veganStatus).toBe(VeganStatus.VEGAN)
      expect(result?.classificationMethod).toBe('product-level')
      expect(result?.imageUrl).toBe('https://resolved.example.com/image.jpg')
      expect(result?.lastScanned).toBeInstanceOf(Date)
    })
  })

  describe('Product-level vegan classification strategy', () => {
    it('should classify as VEGAN when vegan field is "yes"', async () => {
      const mockProduct = {
        product_name: 'Vegan Product',
        vegan: 'yes',
        ingredients_text: ''
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.VEGAN)
      expect(result?.classificationMethod).toBe('product-level')
      expect(result?.nonVeganIngredients).toEqual([])
    })

    it('should classify as VEGETARIAN when vegan is "no" but vegetarian is "yes"', async () => {
      const mockProduct = {
        product_name: 'Vegetarian Product',
        vegan: 'no',
        vegetarian: 'yes',
        ingredients_text: ''
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.VEGETARIAN)
      expect(result?.classificationMethod).toBe('product-level')
    })

    it('should classify as NOT_VEGAN when both vegan and vegetarian are "no"', async () => {
      const mockProduct = {
        product_name: 'Non-Vegetarian Product',
        vegan: 'no',
        vegetarian: 'no',
        ingredients_text: ''
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.NOT_VEGAN)
      expect(result?.classificationMethod).toBe('product-level')
    })

    it('should handle various string formats for vegan field', async () => {
      const testCases = [
        { vegan: '1', expected: VeganStatus.VEGAN },
        { vegan: 'true', expected: VeganStatus.VEGAN },
        { vegan: 'VEGAN', expected: VeganStatus.VEGAN },
        { vegan: '0', expected: VeganStatus.NOT_VEGAN },
        { vegan: 'false', expected: VeganStatus.NOT_VEGAN },
        { vegan: 'non-vegan', expected: VeganStatus.NOT_VEGAN }
      ]

      for (const testCase of testCases) {
        const mockProduct = {
          product_name: 'Test Product',
          vegan: testCase.vegan,
          ingredients_text: ''
        }

        const mockResponse: OpenFoodFactsProduct = {
          code: mockBarcode,
          status: 1,
          product: mockProduct
        }

        mockAxios.get.mockResolvedValue({ data: mockResponse })

        const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

        expect(result?.veganStatus).toBe(testCase.expected)
        expect(result?.classificationMethod).toBe('product-level')
      }
    })
  })

  describe('Structured ingredients classification strategy', () => {
    it('should classify as NOT_VEGAN when contains meat ingredients', async () => {
      const structuredIngredients: StructuredIngredient[] = [
        {
          id: 'water',
          text: 'Water',
          vegan: 'yes',
          vegetarian: 'yes'
        },
        {
          id: 'beef',
          text: 'Beef',
          vegan: 'no',
          vegetarian: 'no'
        }
      ]

      const mockProduct = {
        product_name: 'Non-Vegan Product',
        ingredients: structuredIngredients,
        ingredients_text: 'water, beef'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.NOT_VEGAN)
      expect(result?.classificationMethod).toBe('structured')
      expect(result?.nonVeganIngredients).toHaveLength(1)
      expect(result?.nonVeganIngredients?.[0]).toEqual({
        ingredient: 'Beef',
        reason: 'Contains meat or animal products',
        verdict: 'not_vegan'
      })
    })

    it('should classify as VEGETARIAN when contains dairy but no meat', async () => {
      const structuredIngredients: StructuredIngredient[] = [
        {
          id: 'water',
          text: 'Water',
          vegan: 'yes',
          vegetarian: 'yes'
        },
        {
          id: 'milk',
          text: 'Milk',
          vegan: 'no',
          vegetarian: 'yes'
        }
      ]

      const mockProduct = {
        product_name: 'Vegetarian Product',
        ingredients: structuredIngredients,
        ingredients_text: 'water, milk'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.VEGETARIAN)
      expect(result?.classificationMethod).toBe('structured')
      expect(result?.nonVeganIngredients).toHaveLength(1)
      expect(result?.nonVeganIngredients?.[0]).toEqual({
        ingredient: 'Milk',
        reason: 'Contains dairy or eggs',
        verdict: 'vegetarian'
      })
    })

    it('should classify as VEGAN when 60% or more ingredients are explicitly vegan', async () => {
      const structuredIngredients: StructuredIngredient[] = [
        {
          id: 'water',
          text: 'Water',
          vegan: 'yes',
          vegetarian: 'yes'
        },
        {
          id: 'salt',
          text: 'Salt',
          vegan: 'yes',
          vegetarian: 'yes'
        },
        {
          id: 'sugar',
          text: 'Sugar',
          vegan: 'yes',
          vegetarian: 'yes'
        },
        {
          id: 'flour',
          text: 'Flour'
          // No vegan/vegetarian status (unknown)
        }
      ]

      const mockProduct = {
        product_name: 'Mostly Vegan Product',
        ingredients: structuredIngredients,
        ingredients_text: 'water, salt, sugar, flour'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.VEGAN)
      expect(result?.classificationMethod).toBe('structured')
      expect(result?.nonVeganIngredients).toEqual([])
    })

    it('should handle misclassified dairy ingredients correctly', async () => {
      const structuredIngredients: StructuredIngredient[] = [
        {
          id: 'whey',
          text: 'Whey protein',
          vegan: 'no'
          // Missing vegetarian field but contains dairy keyword
        }
      ]

      const mockProduct = {
        product_name: 'Whey Product',
        ingredients: structuredIngredients,
        ingredients_text: 'whey protein'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.VEGETARIAN)
      expect(result?.classificationMethod).toBe('structured')
      expect(result?.nonVeganIngredients).toHaveLength(1)
      expect(result?.nonVeganIngredients?.[0]).toEqual({
        ingredient: 'Whey protein',
        reason: 'Contains dairy products',
        verdict: 'vegetarian'
      })
    })
  })

  describe('Text-based classification strategy', () => {
    it('should classify as VEGAN when no non-vegan ingredients found', async () => {
      const mockProduct = {
        product_name: 'Vegan Product',
        ingredients_text: 'water, salt, sugar, flour, oil'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.VEGAN)
      expect(result?.classificationMethod).toBe('text-based')
      expect(result?.nonVeganIngredients).toEqual([])
    })

    it('should classify as VEGETARIAN when contains only dairy/eggs', async () => {
      const mockProduct = {
        product_name: 'Vegetarian Product',
        ingredients_text: 'water, flour, milk, eggs, cheese'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.VEGETARIAN)
      expect(result?.classificationMethod).toBe('text-based')
      expect(result?.nonVeganIngredients).toHaveLength(3)
      
      const ingredientNames = result?.nonVeganIngredients?.map(ing => ing.ingredient.toLowerCase())
      expect(ingredientNames).toContain('milk')
      expect(ingredientNames).toContain('eggs')
      expect(ingredientNames).toContain('cheese')
    })

    it('should classify as NOT_VEGAN when contains meat products', async () => {
      const mockProduct = {
        product_name: 'Non-Vegetarian Product',
        ingredients_text: 'water, beef, chicken, salt'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.NOT_VEGAN)
      expect(result?.classificationMethod).toBe('text-based')
      expect(result?.nonVeganIngredients).toHaveLength(2)
      
      const ingredientNames = result?.nonVeganIngredients?.map(ing => ing.ingredient.toLowerCase())
      expect(ingredientNames).toContain('beef')
      expect(ingredientNames).toContain('chicken')
    })

    it('should classify as NOT_VEGAN when contains both dairy and meat', async () => {
      const mockProduct = {
        product_name: 'Mixed Non-Vegan Product',
        ingredients_text: 'water, beef, milk, salt'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.NOT_VEGAN)
      expect(result?.classificationMethod).toBe('text-based')
      expect(result?.nonVeganIngredients).toHaveLength(2)
    })

    it('should handle complex ingredient parsing with exact matches', async () => {
      const mockProduct = {
        product_name: 'Complex Product',
        ingredients_text: 'Water; Salt, Sugar. milk, honey, Natural flavors'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      // Honey is considered non-vegan (not just vegetarian), so this should be NOT_VEGAN
      expect(result?.veganStatus).toBe(VeganStatus.NOT_VEGAN)
      expect(result?.classificationMethod).toBe('text-based')
      
      const ingredientNames = result?.nonVeganIngredients?.map(ing => ing.ingredient.toLowerCase())
      expect(ingredientNames).toContain('milk')
      expect(ingredientNames).toContain('honey')
    })

    it('should handle complex ingredient parsing for vegetarian products', async () => {
      const mockProduct = {
        product_name: 'Complex Vegetarian Product',
        ingredients_text: 'Water; Salt, Sugar. milk, cheese, Natural flavors'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.VEGETARIAN)
      expect(result?.classificationMethod).toBe('text-based')
      
      const ingredientNames = result?.nonVeganIngredients?.map(ing => ing.ingredient.toLowerCase())
      expect(ingredientNames).toContain('milk')
      expect(ingredientNames).toContain('cheese')
    })

    it('should only match exact ingredient names (not partial)', async () => {
      const mockProduct = {
        product_name: 'Partial Match Test',
        ingredients_text: 'coconut milk, almond milk, soy milk powder'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      // None of these should match "milk" exactly, so should be vegan
      expect(result?.veganStatus).toBe(VeganStatus.VEGAN)
      expect(result?.classificationMethod).toBe('text-based')
      expect(result?.nonVeganIngredients).toEqual([])
    })

    it('should return UNKNOWN when ingredients text is empty', async () => {
      const mockProduct = {
        product_name: 'Unknown Product',
        ingredients_text: ''
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.UNKNOWN)
      expect(result?.classificationMethod).toBe('text-based')
      expect(result?.nonVeganIngredients).toEqual([])
    })
  })

  describe('Classification method priority', () => {
    it('should prefer product-level over structured ingredients', async () => {
      const structuredIngredients: StructuredIngredient[] = [
        {
          id: 'milk',
          text: 'Milk',
          vegan: 'no',
          vegetarian: 'yes'
        }
      ]

      const mockProduct = {
        product_name: 'Override Test',
        vegan: 'yes', // Product-level says vegan
        ingredients: structuredIngredients, // But ingredients suggest vegetarian
        ingredients_text: 'milk'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.VEGAN)
      expect(result?.classificationMethod).toBe('product-level')
    })

    it('should prefer structured ingredients over text-based', async () => {
      const structuredIngredients: StructuredIngredient[] = [
        {
          id: 'special-milk',
          text: 'Special plant milk',
          vegan: 'yes',
          vegetarian: 'yes'
        }
      ]

      const mockProduct = {
        product_name: 'Override Test 2',
        ingredients: structuredIngredients, // Structured says vegan
        ingredients_text: 'milk' // Text analysis would say vegetarian
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.VEGAN)
      expect(result?.classificationMethod).toBe('structured')
    })

    it('should fall back to text-based when other methods return UNKNOWN', async () => {
      const mockProduct = {
        product_name: 'Fallback Test',
        // No vegan/vegetarian fields
        // No structured ingredients
        ingredients_text: 'water, salt, beef'
      }

      const mockResponse: OpenFoodFactsProduct = {
        code: mockBarcode,
        status: 1,
        product: mockProduct
      }

      mockAxios.get.mockResolvedValue({ data: mockResponse })

      const result = await OpenFoodFactsService.getProductByBarcode(mockBarcode)

      expect(result?.veganStatus).toBe(VeganStatus.NOT_VEGAN)
      expect(result?.classificationMethod).toBe('text-based')
    })
  })
})