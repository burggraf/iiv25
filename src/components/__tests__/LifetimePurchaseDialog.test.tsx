import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Platform } from 'react-native'
import LifetimePurchaseDialog from '../LifetimePurchaseDialog'

describe('LifetimePurchaseDialog', () => {
	const mockOnClose = jest.fn()
	const mockOnOpenSubscriptionManagement = jest.fn()

	beforeEach(() => {
		jest.clearAllMocks()
	})

	it('should render when visible', () => {
		render(
			<LifetimePurchaseDialog
				visible={true}
				onClose={mockOnClose}
				onOpenSubscriptionManagement={mockOnOpenSubscriptionManagement}
			/>
		)

		expect(screen.getByText('Lifetime Purchase Complete!')).toBeTruthy()
		expect(screen.getByText('Important: Cancel Existing Subscription')).toBeTruthy()
	})

	it('should not render when not visible', () => {
		render(
			<LifetimePurchaseDialog
				visible={false}
				onClose={mockOnClose}
				onOpenSubscriptionManagement={mockOnOpenSubscriptionManagement}
			/>
		)

		expect(screen.queryByText('Lifetime Purchase Complete!')).toBeNull()
	})

	it('should show iOS-specific instructions on iOS', () => {
		Platform.OS = 'ios'
		
		render(
			<LifetimePurchaseDialog
				visible={true}
				onClose={mockOnClose}
				onOpenSubscriptionManagement={mockOnOpenSubscriptionManagement}
			/>
		)

		expect(screen.getByText('Cancel Your Existing iOS Subscription')).toBeTruthy()
		expect(screen.getByText('Open Settings on your device')).toBeTruthy()
		expect(screen.getByText('Open Settings')).toBeTruthy()
	})

	it('should show Android-specific instructions on Android', () => {
		Platform.OS = 'android'
		
		render(
			<LifetimePurchaseDialog
				visible={true}
				onClose={mockOnClose}
				onOpenSubscriptionManagement={mockOnOpenSubscriptionManagement}
			/>
		)

		expect(screen.getByText('Cancel Your Existing Android Subscription')).toBeTruthy()
		expect(screen.getByText('Open the Google Play Store app')).toBeTruthy()
		expect(screen.getByText('Open Play Store')).toBeTruthy()
	})

	it('should call onClose when "I\'ll Do This Later" is pressed', () => {
		render(
			<LifetimePurchaseDialog
				visible={true}
				onClose={mockOnClose}
				onOpenSubscriptionManagement={mockOnOpenSubscriptionManagement}
			/>
		)

		fireEvent.press(screen.getByText('I\'ll Do This Later'))
		expect(mockOnClose).toHaveBeenCalledTimes(1)
	})

	it('should call onOpenSubscriptionManagement and onClose when primary button is pressed', () => {
		Platform.OS = 'ios'
		
		render(
			<LifetimePurchaseDialog
				visible={true}
				onClose={mockOnClose}
				onOpenSubscriptionManagement={mockOnOpenSubscriptionManagement}
			/>
		)

		fireEvent.press(screen.getByText('Open Settings'))
		expect(mockOnOpenSubscriptionManagement).toHaveBeenCalledTimes(1)
		expect(mockOnClose).toHaveBeenCalledTimes(1)
	})

	it('should handle missing onOpenSubscriptionManagement prop gracefully', () => {
		render(
			<LifetimePurchaseDialog
				visible={true}
				onClose={mockOnClose}
			/>
		)

		// Should still show the dialog but without the primary button
		expect(screen.getByText('Lifetime Purchase Complete!')).toBeTruthy()
		expect(screen.getByText('I\'ll Do This Later')).toBeTruthy()
	})
})