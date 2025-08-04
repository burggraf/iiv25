import ProductCreationCameraScreen from '../../src/screens/ProductCreationCameraScreen'
import { Stack } from 'expo-router'

export default function ProductCreationCameraPage() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <ProductCreationCameraScreen />
    </>
  )
}