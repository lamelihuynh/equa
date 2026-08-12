import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>EQUA · MOBILE SCAFFOLD</Text>
      <Text style={styles.title}>Chi tiêu chung, rõ ràng hơn.</Text>
      <Text style={styles.body}>
        Expo shell đã sẵn sàng cho kiến trúc offline-first. Chưa có business feature hoặc dữ liệu
        production.
      </Text>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#f2f5f1',
  },
  eyebrow: {
    color: '#2a7761',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  title: {
    marginTop: 16,
    color: '#17352c',
    fontSize: 44,
    fontWeight: '700',
    lineHeight: 48,
  },
  body: {
    marginTop: 20,
    color: '#4d625b',
    fontSize: 17,
    lineHeight: 27,
  },
});
