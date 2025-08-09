import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SpinnerIcon from './icons/SpinnerIcon';
import { backgroundQueueService } from '../services/backgroundQueueService';
import { jobEventManager } from '../services/JobEventManager';

interface JobStatusIndicatorProps {
  style?: any;
}

const JobStatusIndicator: React.FC<JobStatusIndicatorProps> = ({ style }) => {
  const insets = useSafeAreaInsets();
  const [activeJobCount, setActiveJobCount] = useState(0);

  // Get jobs directly from service, bypass the broken hook
  const updateJobCount = async () => {
    const directJobs = await backgroundQueueService.getActiveJobs();
    setActiveJobCount(directJobs.length);
    console.log('[JobStatusIndicator] Direct job count:', directJobs.length);
  };

  // Listen for job events and update count
  useEffect(() => {
    updateJobCount(); // Initial check
    
    const unsubscribe = jobEventManager.subscribe('JobStatusIndicator', () => {
      updateJobCount(); // Update when jobs change
    });
    
    return unsubscribe;
  }, []);

  // Only show when there are active jobs
  if (activeJobCount === 0) {
    return null;
  }

  return (
    <View 
      style={[
        styles.container, 
        { 
          top: insets.top + 8,
          left: 16,
        }, 
        style
      ]}
    >
      <SpinnerIcon size={24} color="#14A44A" />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{activeJobCount}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 999,
  },
  badge: {
    backgroundColor: '#FF6B35',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default JobStatusIndicator;