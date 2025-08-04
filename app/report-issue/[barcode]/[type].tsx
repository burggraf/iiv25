import ReportIssueCameraScreen from '../../../src/screens/ReportIssueCameraScreen'
import { Stack } from 'expo-router'

export default function ReportIssueCameraPage() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <ReportIssueCameraScreen />
    </>
  )
}