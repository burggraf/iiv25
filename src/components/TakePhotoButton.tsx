import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';

interface TakePhotoButtonProps {
  onPress: () => void;
  style?: any;
}

export default function TakePhotoButton({ onPress, style }: TakePhotoButtonProps) {
  return (
    <TouchableOpacity 
      style={[styles.container, style]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <Text style={styles.text}>take</Text>
        <Text style={styles.text}>photo</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#007AFF', // iOS blue color
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0056CC',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3, // Android shadow
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: 'black',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 12,
  },
});