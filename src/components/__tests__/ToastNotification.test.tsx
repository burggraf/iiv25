import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import ToastNotification from '../ToastNotification'

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

describe('ToastNotification', () => {
	const defaultProps = {
		visible: true,
		message: 'Test notification',
		type: 'success' as const,
		onDismiss: jest.fn(),
	}

	beforeEach(() => {
		jest.clearAllMocks()
		jest.useFakeTimers()
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('renders success notification with correct styling', () => {
		const { getByText } = render(<ToastNotification {...defaultProps} />)

		expect(getByText('Test notification')).toBeTruthy()
		expect(getByText('✅')).toBeTruthy()
	})

	it('renders error notification with correct styling', () => {
		const { getByText } = render(
			<ToastNotification {...defaultProps} type="error" message="Error message" />
		)

		expect(getByText('Error message')).toBeTruthy()
		expect(getByText('❌')).toBeTruthy()
	})

	it('calls onDismiss when dismiss button is pressed', () => {
		const onDismiss = jest.fn()
		const { getByText } = render(<ToastNotification {...defaultProps} onDismiss={onDismiss} />)

		fireEvent.press(getByText('×'))

		expect(onDismiss).toHaveBeenCalledTimes(1)
	})

	it('calls onPress and onDismiss when notification is pressed', () => {
		const onPress = jest.fn()
		const onDismiss = jest.fn()
		const { getByText } = render(
			<ToastNotification {...defaultProps} onPress={onPress} onDismiss={onDismiss} />
		)

		fireEvent.press(getByText('Test notification'))

		expect(onPress).toHaveBeenCalledTimes(1)
		expect(onDismiss).toHaveBeenCalledTimes(1)
	})

	it('auto-dismisses after specified duration', async () => {
		const onDismiss = jest.fn()
		render(<ToastNotification {...defaultProps} onDismiss={onDismiss} duration={2000} />)

		// Fast forward time
		jest.advanceTimersByTime(2000)

		await waitFor(() => {
			expect(onDismiss).toHaveBeenCalledTimes(1)
		})
	})

	it('does not auto-dismiss when autoDismiss is false', () => {
		const onDismiss = jest.fn()
		render(<ToastNotification {...defaultProps} onDismiss={onDismiss} autoDismiss={false} />)

		jest.advanceTimersByTime(5000)

		expect(onDismiss).not.toHaveBeenCalled()
	})

	it('does not render when visible is false', () => {
		const { queryByText } = render(<ToastNotification {...defaultProps} visible={false} />)

		expect(queryByText('Test notification')).toBeNull()
	})

	it('truncates long messages to 2 lines', () => {
		const longMessage = 'This is a very long message that should be truncated to ensure it fits within the notification space and does not overflow'
		const { getByText } = render(<ToastNotification {...defaultProps} message={longMessage} />)

		const messageElement = getByText(longMessage)
		expect(messageElement.props.numberOfLines).toBe(2)
	})
})