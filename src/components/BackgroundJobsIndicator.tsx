import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useBackgroundJobs } from '../hooks/useBackgroundJobs';
import { colors } from '../utils/colors';

interface BackgroundJobsIndicatorProps {
  onPress?: () => void;
}

export const BackgroundJobsIndicator: React.FC<BackgroundJobsIndicatorProps> = ({ onPress }) => {
  const { activeJobs, loading } = useBackgroundJobs();

  if (loading || activeJobs.length === 0) {
    return null;
  }

  const processingJobs = activeJobs.filter(job => job.status === 'processing');
  const queuedJobs = activeJobs.filter(job => job.status === 'queued');

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.indicator}>
        <ActivityIndicator size="small" color={colors.primary} />
        <View style={styles.textContainer}>
          <Text style={styles.mainText}>
            {processingJobs.length > 0 
              ? `${processingJobs.length} processing...`
              : `${queuedJobs.length} queued...`
            }
          </Text>
          {processingJobs.length > 0 && queuedJobs.length > 0 && (
            <Text style={styles.subText}>
              {queuedJobs.length} waiting
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 8,
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    marginLeft: 8,
    flex: 1,
  },
  mainText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  subText: {
    fontSize: 12,
    color: colors.secondary,
  },
});