import { StyleSheet, View, Text } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.simpleContainer}>
      <Text style={styles.title}>Is It Vegan?</Text>
      <Text style={styles.subtitle}>Tap the Scanner tab below to start!</Text>
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
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
});
