import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { BackgroundJob } from '../types/backgroundJobs';
import { useBackgroundJobs } from '../hooks/useBackgroundJobs';
import { useGlobalJobs } from '../hooks/useGlobalJobs';
import { colors } from '../utils/colors';
import ProductDisplayContainer from './ProductDisplayContainer';
import { Product } from '../types';
import { ProductImageUrlService } from '../services/productImageUrlService';
import TakePhotoButton from './TakePhotoButton';

interface JobStatusModalProps {
  isVisible: boolean;
  onClose: () => void;
}

const JobStatusModal: React.FC<JobStatusModalProps> = ({ isVisible, onClose }) => {
  // Use global jobs for display, but keep background jobs hook for actions
  const { activeJobs: globalActiveJobs, completedJobs: globalCompletedJobs } = useGlobalJobs();
  const { loading, cancelJob, retryJob, clearCompletedJobs, clearAllJobs } = useBackgroundJobs();
  
  // Use global jobs for display
  const activeJobs = globalActiveJobs;
  const completedJobs = globalCompletedJobs;
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductDetail, setShowProductDetail] = useState(false);

  // DEBUGGING: Log the modal visibility and jobs state
  React.useEffect(() => {
    if (isVisible) {
      console.log(`🚨 [DEBUG] MODAL OPENED - activeJobs from AppContext:`, {
        activeJobsLength: activeJobs?.length || 0,
        activeJobsData: activeJobs?.map(job => ({
          id: job.id?.slice(-6),
          jobType: job.jobType,
          workflowType: job.workflowType,
          status: job.status
        })) || []
      });
    }
  }, [isVisible, activeJobs]);

  const handleCancelJob = async (jobId: string) => {
    setActionLoading(jobId);
    try {
      const success = await cancelJob(jobId);
      if (!success) {
        Alert.alert('Error', 'Could not cancel job. It may already be processing.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to cancel job. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setActionLoading(jobId);
    try {
      const success = await retryJob(jobId);
      if (!success) {
        Alert.alert('Error', 'Could not retry job. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to retry job. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearCompleted = () => {
    Alert.alert(
      'Clear Completed Jobs',
      'Are you sure you want to clear all completed jobs? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: clearCompletedJobs
        },
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      'Fix Uploads',
      'Choose an option to fix any stuck uploads.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Cleanup Stuck Uploads', 
          onPress: async () => {
            const { backgroundQueueService } = await import('../services/backgroundQueueService');
            const cleaned = await backgroundQueueService.cleanupStuckJobs();
            Alert.alert('Cleanup Complete', `Cleaned up ${cleaned} stuck uploads.`);
          }
        },
        { 
          text: 'Clear All', 
          style: 'destructive',
          onPress: clearAllJobs
        },
      ]
    );
  };

  const formatJobType = (jobType: string): string => {
    switch (jobType) {
      case 'product_creation':
        return 'Product Creation';
      case 'ingredient_parsing':
        return 'Ingredients Photo';
      case 'product_photo_upload':
        return 'Product Photo';
      default:
        return jobType.replace('_', ' ');
    }
  };

  const formatElapsedTime = (startTime: Date, endTime?: Date): string => {
    if (!startTime) return 'Unknown';
    
    const end = endTime || new Date();
    const elapsed = Math.floor((end.getTime() - startTime.getTime()) / 1000);
    
    if (elapsed < 0) return '0s';
    if (elapsed < 60) return `${elapsed}s`;
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
    return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
  };

  const getStatusIcon = (status: string): React.ReactNode => {
    switch (status) {
      case 'queued':
        return <MaterialIcons name="schedule" size={20} color={colors.secondary} />;
      case 'processing':
        return <ActivityIndicator size="small" color={colors.primary} />;
      case 'completed':
        return <MaterialIcons name="check-circle" size={20} color={colors.success} />;
      case 'failed':
        return <MaterialIcons name="error" size={20} color={colors.error} />;
      case 'cancelled':
        return <MaterialIcons name="cancel" size={20} color={colors.secondary} />;
      default:
        return <MaterialIcons name="help" size={20} color={colors.secondary} />;
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'failed':
        return colors.error;
      case 'processing':
        return colors.primary;
      default:
        return colors.secondary;
    }
  };

  const JobCard: React.FC<{ job: BackgroundJob }> = ({ job }) => {
    const [productData, setProductData] = useState<Product | null>(null);
    const [loadingProduct, setLoadingProduct] = useState(false);
    
    // Load product data on mount
    React.useEffect(() => {
      const loadProduct = async () => {
        if (job.upc && !productData && !loadingProduct) {
          setLoadingProduct(true);
          try {
            const { ProductLookupService } = await import('../services/productLookupService');
            const result = await ProductLookupService.lookupProductByBarcode(job.upc, { context: 'JobModal' });
            if (result.product) {
              setProductData(result.product);
            }
          } catch (error) {
            console.error('Error fetching product for job card:', error);
          } finally {
            setLoadingProduct(false);
          }
        }
      };
      
      loadProduct();
    }, [job.upc, productData, loadingProduct]);
    
    // Try to get product info from various sources
    const getProductInfo = () => {
      // First try the fetched product data
      if (productData) {
        return {
          name: productData.name || `Product ${job.upc}`,
          brand: productData.brand,
          imageUrl: productData.imageUrl
        };
      }
      
      // Check if job has product data embedded
      if (job.resultData?.productData) {
        return {
          name: job.resultData.productData.name || `Product ${job.upc}`,
          brand: job.resultData.productData.brand,
          imageUrl: job.resultData.productData.imageUrl
        };
      }
      // Check if job has existing product data
      if (job.existingProductData) {
        return {
          name: job.existingProductData.name || `Product ${job.upc}`,
          brand: job.existingProductData.brand,
          imageUrl: job.existingProductData.imageUrl
        };
      }
      return {
        name: `Product ${job.upc || 'Unknown'}`,
        brand: null,
        imageUrl: null
      };
    };
    
    const productInfo = getProductInfo();
    
    const handleJobCardPress = () => {
      if (productData) {
        setSelectedProduct(productData);
        setShowProductDetail(true);
      }
    };

    const getStatusTextColor = (status: string) => {
      switch (status.toLowerCase()) {
        case 'completed':
          return colors.success;
        case 'failed':
          return colors.error;
        case 'processing':
          return colors.primary;
        case 'queued':
          return colors.secondary;
        case 'cancelled':
          return colors.secondary;
        default:
          return colors.secondary;
      }
    };

    const formatStatusWithType = (status: string, jobType: string) => {
      const typeText = formatJobType(jobType);
      const statusText = status.charAt(0).toUpperCase() + status.slice(1);
      return { text: `${typeText} - ${statusText}`, color: getStatusTextColor(status) };
    };
    
    return (
      <TouchableOpacity 
        key={`job-card-${job.id}`} 
        style={styles.jobCard}
        onPress={handleJobCardPress}
        activeOpacity={0.7}
      >
        <View style={styles.jobCardContent}>
          {/* Left side - Product image */}
          <View style={styles.jobImageContainer}>
            {productInfo.imageUrl ? (
              <Image 
                source={{ 
                  uri: (() => {
                    const baseUrl = ProductImageUrlService.resolveImageUrl(productInfo.imageUrl, job.upc || '');
                    if (!baseUrl) return undefined;
                    const timestamp = Date.now();
                    const separator = baseUrl.includes('?') ? '&' : '?';
                    const cacheBustedUrl = `${baseUrl}${separator}job_cache_bust=${timestamp}`;
                    return cacheBustedUrl;
                  })()
                }} 
                style={styles.jobImage} 
              />
            ) : (
              <View style={styles.jobImagePlaceholder}>
                {loadingProduct ? (
                  <ActivityIndicator size="small" color={colors.secondary} />
                ) : (
                  <MaterialIcons name="image" size={24} color={colors.secondary} />
                )}
              </View>
            )}
          </View>
          
          {/* Center - Product info */}
          <View style={styles.jobCenter}>
            <Text style={styles.jobProductName} numberOfLines={1}>
              {productInfo.name}
            </Text>
            <Text style={styles.jobUpc} numberOfLines={1}>
              UPC: {job.upc || 'Unknown'}
            </Text>
            {(() => {
              const statusInfo = formatStatusWithType(job.status || 'unknown', job.jobType || 'unknown');
              return (
                <Text style={[styles.jobTypeAndStatus, { color: statusInfo.color }]} numberOfLines={1}>
                  {statusInfo.text}
                </Text>
              );
            })()}
          </View>
          
          {/* Right side - Actions */}
          <View style={styles.jobActions}>
            {job.status === 'queued' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={(e) => {
                  e.stopPropagation();
                  handleCancelJob(job.id);
                }}
                disabled={actionLoading === job.id}
              >
                {actionLoading === job.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                )}
              </TouchableOpacity>
            )}
            
            {job.status === 'failed' && (
              <TouchableOpacity
                style={styles.retryIconButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleRetryJob(job.id);
                }}
                disabled={actionLoading === job.id}
              >
                {actionLoading === job.id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MaterialIcons name="refresh" size={24} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderJobCard = (job: BackgroundJob): React.ReactNode => {
    if (!job || !job.id) return null;
    return <JobCard key={job.id} job={job} />;
  };

  const renderActiveJobs = (): React.ReactNode => {
    // DEBUGGING: Log what activeJobs we're receiving in the modal
    console.log(`🚨 [DEBUG] JobStatusModal activeJobs:`, {
      hasActiveJobs: !!activeJobs,
      isArray: Array.isArray(activeJobs),
      length: activeJobs?.length || 0,
      jobs: activeJobs?.map(job => ({
        id: job.id?.slice(-6),
        jobType: job.jobType,
        workflowType: job.workflowType,
        status: job.status
      }))
    });
    
    if (!activeJobs || !Array.isArray(activeJobs) || activeJobs.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Uploads ({activeJobs.length})</Text>
        {activeJobs.filter(job => job && job.id).map((job, index) => (
          <View key={`active-${job.id}-${index}`}>
            {renderJobCard(job)}
          </View>
        ))}
      </View>
    );
  };

  const renderCompletedJobs = (): React.ReactNode => {
    if (!completedJobs || !Array.isArray(completedJobs) || completedJobs.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Uploads ({completedJobs.length})</Text>
          <TouchableOpacity onPress={handleClearCompleted} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
        </View>
        {completedJobs.slice(0, 20).filter(job => job && job.id).map((job, index) => (
          <View key={`completed-${job.id}-${index}`}>
            {renderJobCard(job)}
          </View>
        ))}
      </View>
    );
  };

  const renderEmptyState = (): React.ReactNode => {
    const hasActiveJobs = activeJobs && activeJobs.length > 0;
    const hasCompletedJobs = completedJobs && completedJobs.length > 0;
    
    if (hasActiveJobs || hasCompletedJobs) return null;
    
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="work-off" size={48} color={colors.secondary} />
        <Text style={styles.emptyText}>No uploads</Text>
        <Text style={styles.emptySubtext}>
          Uploads will appear here when you take photos for processing
        </Text>
      </View>
    );
  };

  return (
    <Modal visible={isVisible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClearAll} style={styles.debugButton}>
            <MaterialIcons name="warning" size={28} color="#999" />
          </TouchableOpacity>
          <Text style={styles.title}>Uploads</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading jobs...</Text>
          </View>
        ) : (
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {renderActiveJobs()}
            {renderCompletedJobs()}
            {renderEmptyState()}
          </ScrollView>
        )}
      </SafeAreaView>
      
      {/* Product Detail Overlay */}
      {showProductDetail && selectedProduct && (
        <ProductDisplayContainer
          product={selectedProduct}
          onBack={() => setShowProductDetail(false)}
          backButtonText="← Back to Uploads"
          onProductUpdated={(updatedProduct) => {
            setSelectedProduct(updatedProduct);
          }}
          iconType="scanner"
        />
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  debugButton: {
    padding: 4,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: colors.secondary,
  },
  section: {
    padding: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.error,
    borderRadius: 6,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  jobCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  jobCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    position: 'relative',
    paddingRight: 40, // Make room for the retry icon
  },
  jobImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  jobImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  jobImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCenter: {
    flex: 1,
    marginRight: 12,
  },
  jobProductName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  jobProductBrand: {
    fontSize: 14,
    color: colors.secondary,
    marginBottom: 2,
  },
  jobUpc: {
    fontSize: 14,
    color: colors.secondary,
    marginBottom: 2,
  },
  jobTypeAndStatus: {
    fontSize: 13,
    color: colors.secondary,
    fontWeight: '500',
  },
  jobActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.error,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  retryIconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.secondary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export { JobStatusModal };