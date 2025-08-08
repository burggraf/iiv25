import UnifiedPhotoWorkflowScreen from '../../../src/screens/UnifiedPhotoWorkflowScreen'
import { Stack } from 'expo-router'

export default function ReportIssueCameraPage() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <UnifiedPhotoWorkflowScreen />
    </>
  )
}