/**
 * Photo Capture Hook
 * 
 * Reusable hook that encapsulates all photo capture logic, state management,
 * and workflow orchestration for different photo workflows
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import UnifiedCameraService from '../services/UnifiedCameraService';
import { PhotoWorkflowConfigService } from '../services/PhotoWorkflowConfig';
import { JobSubmissionService } from '../services/JobSubmissionService';
import { CameraViewRef } from '../components/UnifiedCameraView';
import {
  PhotoWorkflowConfig,
  PhotoCaptureState,
  PhotoStepConfig,
  PhotoWorkflowResult,
} from '../types/photoWorkflow';

interface PhotoCaptureHookConfig {
  workflow: PhotoWorkflowConfig;
  onWorkflowComplete?: (result: PhotoWorkflowResult) => void;
  onError?: (error: string) => void;
  onStepComplete?: (stepConfig: PhotoStepConfig, photoUri: string) => void;
}

interface PhotoCaptureHookReturn {
  // State
  state: PhotoCaptureState;
  currentStepConfig: PhotoStepConfig | null;
  cameraRef: React.RefObject<CameraViewRef | null>;
  
  // Actions
  takePhoto: () => Promise<void>;
  retakePhoto: () => void;
  usePhoto: () => Promise<void>;
  cancel: () => void;
  
  // Computed properties
  isLastStep: boolean;
  canProceedToNextStep: boolean;
  progressText: string;
}

export function usePhotoCaptureWorkflow(config: PhotoCaptureHookConfig): PhotoCaptureHookReturn {
  const router = useRouter();
  const { queueJob } = useApp();
  const cameraService = UnifiedCameraService.getInstance();
  const cameraRef = useRef<CameraViewRef>(null);

  // Validate workflow configuration
  if (!PhotoWorkflowConfigService.isValidWorkflowConfig(config.workflow)) {
    throw new Error(`Invalid workflow configuration for type: ${config.workflow.type}`);
  }

  // Initialize state
  const [state, setState] = useState<PhotoCaptureState>({
    currentStepIndex: 0,
    capturedPhotos: new Map(),
    isPreviewMode: false,
    currentPhotoUri: null,
    isProcessing: false,
    error: null,
  });

  // Get current step configuration
  const currentStepConfig = PhotoWorkflowConfigService.getStepConfig(
    config.workflow.type,
    state.currentStepIndex
  );

  // Computed properties
  const isLastStep = state.currentStepIndex >= config.workflow.steps.length - 1;
  const canProceedToNextStep = currentStepConfig !== null && state.currentPhotoUri !== null;
  const progressText = currentStepConfig
    ? `Step ${currentStepConfig.stepNumber} of ${currentStepConfig.totalSteps}: ${currentStepConfig.title}`
    : 'Loading...';

  // Initialize camera when step changes
  useEffect(() => {
    if (!currentStepConfig) return;

    const initializeCamera = async () => {
      console.log(`📷 PhotoCapture: Initializing ${currentStepConfig.cameraMode} mode`);
      
      const success = await cameraService.switchToMode(
        currentStepConfig.cameraMode,
        {},
        `PhotoWorkflow_${config.workflow.type}`
      );
      
      if (!success) {
        const errorMessage = 'Failed to initialize camera. Please try again.';
        setState(prev => ({ ...prev, error: errorMessage }));
        config.onError?.(errorMessage);
        
        Alert.alert(
          'Camera Error',
          errorMessage,
          [{ text: 'OK', onPress: cancel }]
        );
      }
    };

    initializeCamera();

    // Cleanup when component unmounts or step changes
    return () => {
      cameraService.switchToMode('inactive', {}, `PhotoWorkflow_${config.workflow.type}`);
    };
  }, [state.currentStepIndex, currentStepConfig?.cameraMode]);

  /**
   * Captures a photo using the current camera configuration
   */
  const takePhoto = useCallback(async () => {
    if (!cameraRef.current || !currentStepConfig) {
      Alert.alert('Error', 'Camera not available');
      return;
    }

    if (state.isProcessing) {
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      const result = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (!result?.uri) {
        throw new Error('Failed to capture image');
      }

      setState(prev => ({
        ...prev,
        currentPhotoUri: result.uri,
        isPreviewMode: true,
        isProcessing: false,
      }));

    } catch (error) {
      console.error('Error capturing photo:', error);
      const errorMessage = 'Failed to capture photo. Please try again.';
      setState(prev => ({ 
        ...prev, 
        error: errorMessage,
        isProcessing: false,
      }));
      
      config.onError?.(errorMessage);
      Alert.alert('Error', errorMessage);
    }
  }, [currentStepConfig, state.isProcessing]);

  /**
   * Discards the current photo and returns to camera view
   */
  const retakePhoto = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentPhotoUri: null,
      isPreviewMode: false,
      error: null,
    }));
  }, []);

  /**
   * Confirms the current photo and proceeds with workflow
   */
  const usePhoto = useCallback(async () => {
    if (!state.currentPhotoUri || !currentStepConfig || state.isProcessing) {
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true }));

    try {
      // Store the captured photo
      setState(prev => ({
        ...prev,
        capturedPhotos: new Map(prev.capturedPhotos).set(currentStepConfig.step, state.currentPhotoUri!),
      }));

      // Create and validate job parameters using JobSubmissionService
      const factory = JobSubmissionService.createJobFactory();
      
      let jobParams: any;
      switch (currentStepConfig.jobType) {
        case 'product_creation':
          jobParams = factory.productCreation({
            imageUri: state.currentPhotoUri,
            upc: config.workflow.barcode,
            priority: currentStepConfig.jobPriority,
            workflowId: config.workflow.workflowId,
            workflowType: config.workflow.type,
            workflowSteps: currentStepConfig.workflowSteps,
          });
          break;
          
        case 'ingredient_parsing':
          jobParams = factory.ingredientParsing({
            imageUri: state.currentPhotoUri,
            upc: config.workflow.barcode,
            priority: currentStepConfig.jobPriority,
            workflowId: config.workflow.workflowId,
            workflowType: config.workflow.type,
            workflowSteps: currentStepConfig.workflowSteps,
            existingProductData: null,
          });
          break;
          
        case 'product_photo_upload':
          jobParams = factory.productPhotoUpload({
            imageUri: state.currentPhotoUri,
            upc: config.workflow.barcode,
            priority: currentStepConfig.jobPriority,
            workflowId: config.workflow.workflowId,
            workflowType: config.workflow.type as any,
            workflowSteps: currentStepConfig.workflowSteps,
          });
          break;
          
        default:
          throw new Error(`Unsupported job type: ${currentStepConfig.jobType}`);
      }

      // Validate and create standardized job parameters
      const standardizedParams = JobSubmissionService.createStandardizedJobParams(jobParams);
      const description = JobSubmissionService.getJobDescription(jobParams);
      
      console.log(`📷 Submitting job: ${description}`, standardizedParams);

      // DEBUGGING: Special logging for report issue workflows
      if (config.workflow.type === 'report_product_issue' || config.workflow.type === 'report_ingredients_issue') {
        console.log(`🚨 [DEBUG] REPORT ISSUE JOB SUBMISSION:`, {
          workflowType: config.workflow.type,
          jobType: currentStepConfig.jobType,
          barcode: config.workflow.barcode,
          workflowId: config.workflow.workflowId,
          standardizedParams
        });
      }

      await queueJob(standardizedParams as any);

      // Notify step completion
      config.onStepComplete?.(currentStepConfig, state.currentPhotoUri);

      // Check if workflow is complete
      if (isLastStep) {
        // Workflow completed
        const result: PhotoWorkflowResult = {
          success: true,
          completedSteps: Array.from(state.capturedPhotos.keys()).concat([currentStepConfig.step]),
          workflowId: config.workflow.workflowId,
        };

        config.onWorkflowComplete?.(result);

        // Navigate based on workflow type
        const navigation = PhotoWorkflowConfigService.getCompletionNavigation(config.workflow.type);
        switch (navigation) {
          case 'back':
            cameraService.switchToMode('inactive', {}, `PhotoWorkflow_${config.workflow.type}`);
            router.back();
            break;
          case 'home':
            cameraService.switchToMode('inactive', {}, `PhotoWorkflow_${config.workflow.type}`);
            router.replace('/');
            break;
          default:
            cameraService.switchToMode('inactive', {}, `PhotoWorkflow_${config.workflow.type}`);
            router.back();
        }
      } else {
        // Move to next step
        setState(prev => ({
          ...prev,
          currentStepIndex: prev.currentStepIndex + 1,
          currentPhotoUri: null,
          isPreviewMode: false,
          isProcessing: false,
        }));
      }

    } catch (error) {
      console.error('Error processing photo:', error);
      const errorMessage = 'Failed to process photo. Please try again.';
      setState(prev => ({ 
        ...prev, 
        error: errorMessage,
        isProcessing: false,
      }));
      
      config.onError?.(errorMessage);
      Alert.alert('Error', errorMessage);
    }
  }, [state.currentPhotoUri, currentStepConfig, state.isProcessing, isLastStep, config]);

  /**
   * Cancels the workflow and navigates back
   */
  const cancel = useCallback(() => {
    cameraService.switchToMode('inactive', {}, `PhotoWorkflow_${config.workflow.type}`);
    router.back();
  }, [config.workflow.type]);

  return {
    state,
    currentStepConfig,
    cameraRef,
    takePhoto,
    retakePhoto,
    usePhoto,
    cancel,
    isLastStep,
    canProceedToNextStep,
    progressText,
  };
}