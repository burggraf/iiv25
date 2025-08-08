/**
 * Unified Photo Workflow Screen
 * 
 * Single screen that handles all photo capture workflows:
 * - Product creation (front + ingredients photos)
 * - Product issue reporting (single photo)
 * - Ingredients issue reporting (single photo)
 * 
 * Replaces ProductCreationCameraScreen and ReportIssueCameraScreen
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { usePhotoCaptureWorkflow } from '../hooks/PhotoCaptureHook';
import { PhotoWorkflowConfigService } from '../services/PhotoWorkflowConfig';
import UnifiedCameraView from '../components/UnifiedCameraView';
import {
  PhotoWorkflowType,
  PhotoWorkflowConfig,
} from '../types/photoWorkflow';

interface PhotoWorkflowScreenParams {
  barcode: string;
  workflowType: PhotoWorkflowType;
  type?: 'product' | 'ingredients'; // Legacy param for report-issue workflows
}

export default function UnifiedPhotoWorkflowScreen() {
  const rawParams = useLocalSearchParams();
  const params: PhotoWorkflowScreenParams = {
    barcode: String(rawParams.barcode || ''),
    workflowType: rawParams.workflowType as PhotoWorkflowType,
    type: rawParams.type as 'product' | 'ingredients' | undefined,
  };
  
  // Parse and validate parameters
  const barcode = params.barcode;
  let workflowType: PhotoWorkflowType = params.workflowType;
  
  // Handle legacy report-issue routing
  if (!workflowType && params.type) {
    workflowType = params.type === 'product' 
      ? 'report_product_issue' 
      : 'report_ingredients_issue';
  }
  
  if (!barcode || !workflowType) {
    throw new Error('Missing required parameters: barcode and workflowType');
  }

  // Create workflow configuration
  const workflowConfig: PhotoWorkflowConfig = PhotoWorkflowConfigService.createWorkflowConfig(
    workflowType,
    barcode
  );

  // Initialize photo capture workflow
  const {
    state,
    currentStepConfig,
    cameraRef,
    takePhoto,
    retakePhoto,
    usePhoto,
    cancel,
    progressText,
  } = usePhotoCaptureWorkflow({
    workflow: workflowConfig,
    onWorkflowComplete: (result) => {
      console.log(`📷 Workflow completed: ${result.workflowId}`, result);
    },
    onError: (error) => {
      console.error('📷 Workflow error:', error);
    },
    onStepComplete: (stepConfig, photoUri) => {
      console.log(`📷 Step completed: ${stepConfig.step} - ${photoUri}`);
    },
  });

  if (!currentStepConfig) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.errorContainer}>
          <Text style={styles.errorText}>Invalid workflow configuration</Text>
          <TouchableOpacity style={styles.cancelButton} onPress={cancel}>
            <Text style={styles.cancelButtonText}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  // Preview Mode - Show captured photo with controls
  if (state.isPreviewMode && state.currentPhotoUri) {
    return (
      <View style={styles.container}>
        {/* Preview Image */}
        <Image source={{ uri: state.currentPhotoUri }} style={styles.previewImage} />
        
        {/* Photo Frame Overlay */}
        <View style={styles.frameOverlay}>
          <View style={styles.frameTopBottom} />
          <View style={styles.frameMiddle}>
            <View style={styles.frameSide} />
            <View style={styles.photoFrame}>
              <View style={[styles.frameCorner, styles.frameCornerTopLeft]} />
              <View style={[styles.frameCorner, styles.frameCornerTopRight]} />
              <View style={[styles.frameCorner, styles.frameCornerBottomLeft]} />
              <View style={[styles.frameCorner, styles.frameCornerBottomRight]} />
            </View>
            <View style={styles.frameSide} />
          </View>
          <View style={styles.frameTopBottom} />
        </View>

        {/* Bottom Controls for Preview */}
        <SafeAreaView style={styles.bottomControlsContainer}>
          <View style={styles.previewControls}>
            <TouchableOpacity 
              style={styles.retakeButton} 
              onPress={retakePhoto}
              disabled={state.isProcessing}
            >
              <Text style={styles.retakeButtonText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.usePhotoButton, state.isProcessing && styles.disabledButton]} 
              onPress={usePhoto}
              disabled={state.isProcessing}
            >
              <Text style={styles.usePhotoButtonText}>
                {state.isProcessing ? 'Processing...' : 'Use Photo'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Camera Mode - Show camera with overlay
  return (
    <View style={styles.container}>
      <UnifiedCameraView
        ref={cameraRef}
        mode={currentStepConfig.cameraMode}
        owner={`PhotoWorkflow_${workflowType}`}
        onPhotoCaptured={(uri) => {
          // This is handled by the takePhoto function
          console.log('Photo captured via camera view:', uri);
        }}
        onError={(error) => {
          console.error('Camera error:', error);
        }}
        style={styles.camera}
        renderOverlay={(mode, cameraState) => (
          <>
            {/* Photo Frame Overlay */}
            <View style={styles.frameOverlay}>
              <View style={styles.frameTopBottom} />
              <View style={styles.frameMiddle}>
                <View style={styles.frameSide} />
                <View style={styles.photoFrame}>
                  <View style={[styles.frameCorner, styles.frameCornerTopLeft]} />
                  <View style={[styles.frameCorner, styles.frameCornerTopRight]} />
                  <View style={[styles.frameCorner, styles.frameCornerBottomLeft]} />
                  <View style={[styles.frameCorner, styles.frameCornerBottomRight]} />
                </View>
                <View style={styles.frameSide} />
              </View>
              <View style={styles.frameTopBottom} />
            </View>
            
            {/* Top Overlay */}
            <SafeAreaView style={styles.topOverlay}>
              <View style={styles.instructionContainer}>
                <Text style={styles.stepText}>{progressText}</Text>
                <Text style={styles.instructionText}>{currentStepConfig.instruction}</Text>
                {state.error && (
                  <Text style={styles.errorText}>{state.error}</Text>
                )}
              </View>
              <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={cancel}
                disabled={state.isProcessing}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </SafeAreaView>

            {/* Bottom Camera Button */}
            <SafeAreaView style={styles.bottomControlsContainer}>
              <View style={styles.bottomControls}>
                <TouchableOpacity
                  style={[
                    styles.captureButton, 
                    (cameraState.isCapturing || state.isProcessing) && styles.captureButtonDisabled
                  ]}
                  onPress={takePhoto}
                  disabled={cameraState.isCapturing || state.isProcessing}
                >
                  <View style={styles.captureButtonInner} />
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  frameOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  frameTopBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  frameMiddle: {
    flexDirection: 'row',
    height: 420,
  },
  frameSide: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  photoFrame: {
    width: 340,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 8,
  },
  frameCorner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: 'white',
  },
  frameCornerTopLeft: {
    top: 8,
    left: 8,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  frameCornerTopRight: {
    top: 8,
    right: 8,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  frameCornerBottomLeft: {
    bottom: 8,
    left: 8,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  frameCornerBottomRight: {
    bottom: 8,
    right: 8,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 20,
    paddingBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    zIndex: 3,
  },
  instructionContainer: {
    flex: 1,
    paddingRight: 15,
  },
  stepText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  instructionText: {
    color: 'white',
    fontSize: 14,
    lineHeight: 18,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 12,
    marginTop: 5,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomControlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 3,
  },
  bottomControls: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  previewControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 40,
    width: '100%',
  },
  retakeButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  retakeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  usePhotoButton: {
    backgroundColor: 'white',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  usePhotoButtonText: {
    color: 'black',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});