import UnifiedPhotoWorkflowScreen from '../../src/screens/UnifiedPhotoWorkflowScreen'
import { Stack } from 'expo-router'

export default function ProductCreationCameraPage() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <UnifiedPhotoWorkflowScreen />
    </>
  )
}