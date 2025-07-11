import { StyleSheet, View, Text } from 'react-native';
import Logo from '../../src/components/Logo';

export default function HomeScreen() {
  return (
    <View style={styles.simpleContainer}>
      <Logo size={120} style={styles.logo} />
      <Text style={styles.title}>Is It Vegan?</Text>
      <Text style={styles.subtitle}>Check if products are vegan instantly!</Text>
      <Text style={styles.instruction}>
        📷 Use Scanner tab to scan barcodes{'\n'}
        🔢 Use Manual tab to type UPC codes
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  simpleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  logo: {
    marginBottom: 30,
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  instruction: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
  },
});
