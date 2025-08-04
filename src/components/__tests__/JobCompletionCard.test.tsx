import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import JobCompletionCard from '../JobCompletionCard'
import { JobNotification } from '../../context/NotificationContext'
import { VeganStatus } from '../../types'

// Mock Animated
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper')
const mockAnimatedValue = {
	setValue: jest.fn(),
}
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	Animated: {
		Value: jest.fn(() => mockAnimatedValue),
		spring: jest.fn(() => ({ start: jest.fn() })),
		timing: jest.fn(() => ({ start: jest.fn() })),
	},
}))

// Mock SafeAreaInsets
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}))

// Mock LogoWhite component
jest.mock('../LogoWhite', () => {
	return function LogoWhite() {
		return null
	}
})

describe('JobCompletionCard', () => {
	const mockJob = {
		id: 'job_123',
		jobType: 'product_creation' as const,
		status: 'completed' as const,
		priority: 1,
		upc: '123456789012',
		deviceId: 'device_123',
		imageUri: 'file://test.jpg',
		retryCount: 0,
		maxRetries: 3,
		createdAt: new Date(),
	}

	const mockProduct = {
		id: 'product_123',
		barcode: '123456789012',
		name: 'Test Product',
		brand: 'Test Brand',
		veganStatus: VeganStatus.VEGAN,
		ingredients: ['ingredient1', 'ingredient2'],
		imageUrl: 'https://example.com/image.jpg',
		nonVeganIngredients: [],
		issues: '',
	}

	const mockNotification: JobNotification = {
		id: 'notification_123',
		job: mockJob,
		product: mockProduct,
		message: 'New product added',
		type: 'success',
		timestamp: new Date(),
	}

	const defaultProps = {
		notification: mockNotification,
		onPress: jest.fn(),
		onDismiss: jest.fn(),
	}

	beforeEach(() => {
		jest.clearAllMocks()
		jest.useFakeTimers()
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('renders job completion card with product information', () => {
		const { getByText } = render(<JobCompletionCard {...defaultProps} />)

		expect(getByText('New product added')).toBeTruthy()
		expect(getByText('Test Product')).toBeTruthy()
		expect(getByText('VEGAN')).toBeTruthy()
	})

	it('renders error notification correctly', () => {
		const errorNotification = {
			...mockNotification,
			message: 'Failed to add product',
			type: 'error' as const,
		}
		
		const { getByText } = render(
			<JobCompletionCard {...defaultProps} notification={errorNotification} />
		)

		expect(getByText('Failed to add product')).toBeTruthy()
	})

	it('renders notification without product data', () => {
		const notificationWithoutProduct = {
			...mockNotification,
			product: null,
		}
		
		const { getByText, queryByText } = render(
			<JobCompletionCard {...defaultProps} notification={notificationWithoutProduct} />
		)

		expect(getByText('New product added')).toBeTruthy()
		expect(queryByText('Test Product')).toBeNull()
	})

	it('calls onPress when card is pressed', () => {
		const onPress = jest.fn()
		const { getByText } = render(<JobCompletionCard {...defaultProps} onPress={onPress} />)

		fireEvent.press(getByText('New product added'))

		expect(onPress).toHaveBeenCalledTimes(1)
	})

	it('calls onDismiss when dismiss button is pressed', () => {
		const onDismiss = jest.fn()
		const { getByText } = render(<JobCompletionCard {...defaultProps} onDismiss={onDismiss} />)

		fireEvent.press(getByText('×'))

		expect(onDismiss).toHaveBeenCalledTimes(1)
	})

	it('auto-dismisses success notifications after 5 seconds', async () => {
		const onDismiss = jest.fn()
		render(<JobCompletionCard {...defaultProps} onDismiss={onDismiss} />)

		jest.advanceTimersByTime(5000)

		await waitFor(() => {
			expect(onDismiss).toHaveBeenCalledTimes(1)
		})
	})

	it('auto-dismisses error notifications after 7 seconds', async () => {
		const errorNotification = {
			...mockNotification,
			type: 'error' as const,
		}
		const onDismiss = jest.fn()
		
		render(
			<JobCompletionCard {...defaultProps} notification={errorNotification} onDismiss={onDismiss} />
		)

		jest.advanceTimersByTime(7000)

		await waitFor(() => {
			expect(onDismiss).toHaveBeenCalledTimes(1)
		})
	})

	it('displays placeholder image when product has no image', () => {
		const productWithoutImage = {
			...mockProduct,
			imageUrl: '',
		}
		const notificationWithoutImage = {
			...mockNotification,
			product: productWithoutImage,
		}
		
		const { getByText } = render(
			<JobCompletionCard {...defaultProps} notification={notificationWithoutImage} />
		)

		expect(getByText('📦')).toBeTruthy()
	})

	it('displays warning for vegan products with issues', () => {
		const productWithIssues = {
			...mockProduct,
			issues: 'May contain traces of milk',
		}
		const notificationWithIssues = {
			...mockNotification,
			product: productWithIssues,
		}
		
		const { getByText } = render(
			<JobCompletionCard {...defaultProps} notification={notificationWithIssues} />
		)

		expect(getByText('see product detail')).toBeTruthy()
		expect(getByText('⚠️')).toBeTruthy()
	})

	it('handles different vegan status types correctly', () => {
		const testCases = [
			{ status: VeganStatus.VEGETARIAN, expectedText: 'VEGETARIAN' },
			{ status: VeganStatus.NOT_VEGETARIAN, expectedText: 'NOT VEGETARIAN' },
			{ status: VeganStatus.UNKNOWN, expectedText: 'UNKNOWN' },
		]

		testCases.forEach(({ status, expectedText }) => {
			const productWithStatus = {
				...mockProduct,
				veganStatus: status,
			}
			const notificationWithStatus = {
				...mockNotification,
				product: productWithStatus,
			}
			
			const { getByText } = render(
				<JobCompletionCard {...defaultProps} notification={notificationWithStatus} />
			)

			expect(getByText(expectedText)).toBeTruthy()
		})
	})
})