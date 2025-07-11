import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface NumericKeypadProps {
  onNumberPress: (number: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}

export default function NumericKeypad({ onNumberPress, onBackspace, onClear }: NumericKeypadProps) {
  const numbers = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['Clear', '0', '⌫']
  ];

  const handlePress = (value: string) => {
    if (value === 'Clear') {
      onClear();
    } else if (value === '⌫') {
      onBackspace();
    } else {
      onNumberPress(value);
    }
  };

  const getButtonStyle = (value: string) => {
    if (value === 'Clear') {
      return [styles.keyButton, styles.clearButton];
    } else if (value === '⌫') {
      return [styles.keyButton, styles.backspaceButton];
    }
    return styles.keyButton;
  };

  const getButtonTextStyle = (value: string) => {
    if (value === 'Clear' || value === '⌫') {
      return [styles.keyText, styles.actionButtonText];
    }
    return styles.keyText;
  };

  return (
    <View style={styles.container}>
      {numbers.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((value) => (
            <TouchableOpacity
              key={value}
              style={getButtonStyle(value)}
              onPress={() => handlePress(value)}
              activeOpacity={0.7}
            >
              <Text style={getButtonTextStyle(value)}>{value}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  keyButton: {
    flex: 1,
    height: 60,
    backgroundColor: 'white',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  clearButton: {
    backgroundColor: '#ff6b6b',
    borderColor: '#ff5252',
  },
  backspaceButton: {
    backgroundColor: '#ffa726',
    borderColor: '#ff9800',
  },
  keyText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});