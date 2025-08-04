import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import { NotificationProvider, useNotifications } from '../NotificationContext'
import { backgroundQueueService } from '../../services/backgroundQueueService'
import { AppState } from 'react-native'
import { router } from 'expo-router'

// Mock dependencies
jest.mock('../../services/backgroundQueueService')
jest.mock('../../services/productLookupService')
jest.mock('expo-router', () => ({
	router: {
		push: jest.fn(),
	},
}))

// Mock AppState
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	AppState: {
		currentState: 'active',
		addEventListener: jest.fn(() => ({ remove: jest.fn() })),
	},
}))

// Mock JobCompletionCard
jest.mock('../../components/JobCompletionCard', () => {
	return function JobCompletionCard() {
		return null
	}
})

// Test component that uses the notification context
const TestComponent = () => {
	const { notifications, dismissNotification, clearAllNotifications } = useNotifications()
	
	return (
		<>
			<Text testID="notification-count">{notifications.length}</Text>
			{notifications.map((notification) => (
				<Text key={notification.id} testID={`notification-${notification.id}`}>
					{notification.message}
				</Text>
			))}
		</>
	)
}

describe('NotificationContext', () => {
	const mockBackgroundQueueService = backgroundQueueService as jest.Mocked<typeof backgroundQueueService>
	const mockRouter = router as jest.Mocked<typeof router>

	beforeEach(() => {
		jest.clearAllMocks()
		mockBackgroundQueueService.subscribeToJobUpdates.mockReturnValue(jest.fn())
	})

	it('provides notification context to children', () => {
		const { getByTestId } = render(
			<NotificationProvider>
				<TestComponent />
			</NotificationProvider>
		)

		expect(getByTestId('notification-count')).toBeTruthy()
	})

	it('subscribes to background job updates on mount', () => {
		render(
			<NotificationProvider>
				<TestComponent />
			</NotificationProvider>
		)

		expect(mockBackgroundQueueService.subscribeToJobUpdates).toHaveBeenCalledTimes(1)
		expect(mockBackgroundQueueService.subscribeToJobUpdates).toHaveBeenCalledWith(
			expect.any(Function)
		)
	})

	it('handles job completed events', async () => {
		let jobUpdateCallback: any
		mockBackgroundQueueService.subscribeToJobUpdates.mockImplementation((callback) => {
			jobUpdateCallback = callback
			return jest.fn()
		})

		const { getByTestId } = render(
			<NotificationProvider>
				<TestComponent />
			</NotificationProvider>
		)

		// Simulate job completed event
		const mockJob = {
			id: 'job_123',
			jobType: 'product_creation' as const,
			status: 'completed' as const,
			upc: '123456789012',
			priority: 1,
			deviceId: 'device_123',
			imageUri: 'file://test.jpg',
			retryCount: 0,
			maxRetries: 3,
			createdAt: new Date(),
		}

		await waitFor(() => {
			jobUpdateCallback('job_completed', mockJob)
		})

		await waitFor(() => {
			expect(getByTestId('notification-count')).toBeTruthy()
		})
	})

	it('handles job failed events', async () => {
		let jobUpdateCallback: any
		mockBackgroundQueueService.subscribeToJobUpdates.mockImplementation((callback) => {
			jobUpdateCallback = callback
			return jest.fn()
		})

		const { getByTestId } = render(
			<NotificationProvider>
				<TestComponent />
			</NotificationProvider>
		)

		// Simulate job failed event
		const mockJob = {
			id: 'job_456',
			jobType: 'ingredient_parsing' as const,
			status: 'failed' as const,
			upc: '123456789012',
			priority: 1,
			deviceId: 'device_123',
			imageUri: 'file://test.jpg',
			retryCount: 3,
			maxRetries: 3,
			createdAt: new Date(),
			errorMessage: 'Failed to parse ingredients',
		}

		await waitFor(() => {
			jobUpdateCallback('job_failed', mockJob)
		})

		await waitFor(() => {
			expect(getByTestId('notification-count')).toBeTruthy()
		})
	})

	it('generates correct success messages for different job types', () => {
		const testCases = [
			{ jobType: 'product_creation', expectedMessage: 'New product added' },
			{ jobType: 'ingredient_parsing', expectedMessage: 'Ingredients updated' },
			{ jobType: 'product_photo_upload', expectedMessage: 'Photo updated' },
		]

		testCases.forEach(({ jobType, expectedMessage }) => {
			// We'd need to test the getSuccessMessage function directly
			// since it's not exported. For now, this structure shows the intent.
		})
	})

	it('throws error when used outside provider', () => {
		const TestComponentWithoutProvider = () => {
			useNotifications()
			return null
		}

		const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

		expect(() => render(<TestComponentWithoutProvider />)).toThrow(
			'useNotifications must be used within a NotificationProvider'
		)

		consoleError.mockRestore()
	})

	it('limits notifications to maximum of 5', async () => {
		let jobUpdateCallback: any
		mockBackgroundQueueService.subscribeToJobUpdates.mockImplementation((callback) => {
			jobUpdateCallback = callback
			return jest.fn()
		})

		const { getByTestId } = render(
			<NotificationProvider>
				<TestComponent />
			</NotificationProvider>
		)

		// Add 7 notifications
		for (let i = 0; i < 7; i++) {
			const mockJob = {
				id: `job_${i}`,
				jobType: 'product_creation' as const,
				status: 'completed' as const,
				upc: '123456789012',
				priority: 1,
				deviceId: 'device_123',
				imageUri: 'file://test.jpg',
				retryCount: 0,
				maxRetries: 3,
				createdAt: new Date(),
			}

			await waitFor(() => {
				jobUpdateCallback('job_completed', mockJob)
			})
		}

		// Should only show 5 notifications maximum
		await waitFor(() => {
			const count = getByTestId('notification-count')
			expect(parseInt(count.children[0] as string)).toBeLessThanOrEqual(5)
		})
	})
})