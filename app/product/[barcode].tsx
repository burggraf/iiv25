import React, { useEffect, useState } from 'react'
import { useLocalSearchParams, router } from 'expo-router'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ProductResult from '../../src/components/ProductResult'
import { ProductLookupService } from '../../src/services/productLookupService'
import { Product } from '../../src/types'

export default function ProductDetailScreen() {
	const { barcode } = useLocalSearchParams<{ barcode: string }>()
	const [product, setProduct] = useState<Product | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		loadProduct()
	}, [barcode])

	const loadProduct = async () => {
		if (!barcode) {
			setError('Invalid barcode')
			setLoading(false)
			return
		}

		try {
			setLoading(true)
			setError(null)
			
			const result = await ProductLookupService.lookupProductByBarcode(barcode, { context: 'NotificationDetail' })
			
			if (result.product) {
				setProduct(result.product)
			} else {
				setError(result.error || 'Product not found')
			}
		} catch (err) {
			console.error('Error loading product:', err)
			setError('Failed to load product')
		} finally {
			setLoading(false)
		}
	}

	const handleBack = () => {
		router.back()
	}

	const handleProductUpdated = (updatedProduct: Product) => {
		setProduct(updatedProduct)
	}

	if (loading) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color="#007AFF" />
					<Text style={styles.loadingText}>Loading product...</Text>
				</View>
			</SafeAreaView>
		)
	}

	if (error || !product) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.errorContainer}>
					<Text style={styles.errorText}>{error || 'Product not found'}</Text>
				</View>
			</SafeAreaView>
		)
	}

	return (
		<ProductResult
			product={product}
			onBack={handleBack}
			onProductUpdated={handleProductUpdated}
		/>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: 'white',
	},
	loadingContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	loadingText: {
		marginTop: 16,
		fontSize: 16,
		color: '#666',
	},
	errorContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingHorizontal: 20,
	},
	errorText: {
		fontSize: 16,
		color: '#F44336',
		textAlign: 'center',
	},
})