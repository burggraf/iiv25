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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { BackgroundJob } from '../types/backgroundJobs';
import { useBackgroundJobs } from '../hooks/useBackgroundJobs';
import { colors } from '../utils/colors';

interface JobStatusModalProps {
  isVisible: boolean;
  onClose: () => void;
}

const JobStatusModal: React.FC<JobStatusModalProps> = ({ isVisible, onClose }) => {
  const { activeJobs, completedJobs, loading, cancelJob, retryJob, clearCompletedJobs, clearAllJobs } = useBackgroundJobs();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
      'Debug Options',
      'Choose a debug action to help resolve stuck jobs.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Debug Storage', 
          onPress: async () => {
            const { backgroundQueueService } = await import('../services/backgroundQueueService');
            await backgroundQueueService.debugStorageState();
          }
        },
        { 
          text: 'Cleanup Stuck Jobs', 
          onPress: async () => {
            const { backgroundQueueService } = await import('../services/backgroundQueueService');
            const cleaned = await backgroundQueueService.cleanupStuckJobs();
            Alert.alert('Cleanup Complete', `Cleaned up ${cleaned} stuck jobs.`);
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
        return 'Ingredient Parsing';
      case 'product_photo_upload':
        return 'Photo Upload';
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

  const renderJobCard = (job: BackgroundJob): React.ReactNode => {
    if (!job || !job.id) return null;
    
    const createdTime = job.createdAt ? job.createdAt.toLocaleString() : 'Unknown';
    const startedTime = job.startedAt ? job.startedAt.toLocaleString() : '';
    const completedTime = job.completedAt ? job.completedAt.toLocaleString() : '';
    
    return (
      <View key={`job-card-${job.id}`} style={styles.jobCard}>
        <View style={styles.jobHeader}>
          <View style={styles.jobInfo}>
            {getStatusIcon(job.status || 'unknown')}
            <View style={styles.jobText}>
              <Text style={styles.jobTitle}>{formatJobType(job.jobType || 'unknown')}</Text>
              <Text style={styles.jobUpc}>UPC: {job.upc || 'Unknown'}</Text>
            </View>
          </View>
          <Text style={[styles.jobStatus, { color: getStatusColor(job.status || 'unknown') }]}>
            {(job.status || 'unknown').toUpperCase()}
          </Text>
        </View>

        <View style={styles.jobDetails}>
          <Text style={styles.jobTime}>
            Created: {createdTime}
          </Text>
          
          {job.startedAt && (
            <Text style={styles.jobTime}>
              Started: {startedTime}
            </Text>
          )}
          
          {job.completedAt && (
            <Text style={styles.jobTime}>
              Completed: {completedTime}
            </Text>
          )}
          
          {job.status === 'processing' && job.startedAt && (
            <Text style={styles.jobTime}>
              Running for: {formatElapsedTime(job.startedAt)}
            </Text>
          )}
          
          {job.status === 'completed' && job.startedAt && job.completedAt && (
            <Text style={styles.jobTime}>
              Took: {formatElapsedTime(job.startedAt, job.completedAt)}
            </Text>
          )}
          
          {job.retryCount > 0 && (
            <Text style={styles.retryText}>
              Retries: {job.retryCount}/{job.maxRetries}
            </Text>
          )}
          
          {job.errorMessage && (
            <Text style={styles.errorText}>
              Error: {job.errorMessage}
            </Text>
          )}
        </View>

        <View style={styles.jobActions}>
          {job.status === 'queued' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => handleCancelJob(job.id)}
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
              style={[styles.actionButton, styles.retryButton]}
              onPress={() => handleRetryJob(job.id)}
              disabled={actionLoading === job.id}
            >
              {actionLoading === job.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.retryButtonText}>Retry</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderActiveJobs = (): React.ReactNode => {
    if (!activeJobs || !Array.isArray(activeJobs) || activeJobs.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Jobs ({activeJobs.length})</Text>
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
          <Text style={styles.sectionTitle}>Recent Jobs ({completedJobs.length})</Text>
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
        <Text style={styles.emptyText}>No background jobs</Text>
        <Text style={styles.emptySubtext}>
          Jobs will appear here when you take photos for processing
        </Text>
      </View>
    );
  };

  return (
    <Modal visible={isVisible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClearAll} style={styles.debugButton}>
            <Text style={styles.debugButtonText}>🧹 Debug</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Background Jobs</Text>
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
  debugButtonText: {
    fontSize: 12,
    color: colors.error,
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
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  jobInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  jobText: {
    marginLeft: 12,
    flex: 1,
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  jobUpc: {
    fontSize: 14,
    color: colors.secondary,
    marginTop: 2,
  },
  jobStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  jobDetails: {
    marginBottom: 12,
  },
  jobTime: {
    fontSize: 13,
    color: colors.secondary,
    marginBottom: 2,
  },
  retryText: {
    fontSize: 13,
    color: colors.warning,
    marginTop: 4,
  },
  errorText: {
    fontSize: 13,
    color: colors.error,
    marginTop: 4,
  },
  jobActions: {
    flexDirection: 'row',
    gap: 8,
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