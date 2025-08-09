import ScannerScreen from '../../src/screens/ScannerScreen';
import { CameraErrorBoundary } from '../../src/components/CameraErrorBoundary';

export default function Scanner() {
  return (
    <CameraErrorBoundary>
      <ScannerScreen />
    </CameraErrorBoundary>
  );
}