import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

declare const process: { env: Record<string, string | undefined> };

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/v1';
const accessTokenKey = 'equa_access_token';
const refreshTokenKey = 'equa_refresh_token';
type Mode = 'signup' | 'login' | 'forgot';
interface ApiResponse {
  message?: string;
  accessToken?: string;
  refreshToken?: string;
}

export default function App() {
  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    void SecureStore.getItemAsync(accessTokenKey).then((token) => setAuthenticated(Boolean(token)));
  }, []);

  async function logout() {
    await SecureStore.deleteItemAsync(accessTokenKey);
    await SecureStore.deleteItemAsync(refreshTokenKey);
    setPassword('');
    setAuthenticated(false);
  }

  const submit = async () => {
    setLoading(true);
    const endpoint =
      mode === 'signup'
        ? 'auth/register'
        : mode === 'login'
          ? 'auth/login'
          : 'auth/forgot-password';
    const body =
      mode === 'signup'
        ? { displayName: name, email, password }
        : mode === 'login'
          ? { email, password }
          : { email };
    try {
      const response = await fetch(`${apiBaseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Equa-Client': 'mobile' },
        body: JSON.stringify(body),
      });
      const result: unknown = await response.json();
      const apiResult = isApiResponse(result) ? result : {};
      if (!response.ok) throw new Error(apiResult.message ?? 'Không thể hoàn tất yêu cầu.');
      if (mode === 'login') {
        if (!apiResult.accessToken || !apiResult.refreshToken)
          throw new Error('Identity không trả về phiên đăng nhập cho Mobile.');
        await SecureStore.setItemAsync(accessTokenKey, apiResult.accessToken);
        await SecureStore.setItemAsync(refreshTokenKey, apiResult.refreshToken);
        setAuthenticated(true);
        return;
      }
      Alert.alert(
        'Equa',
        mode === 'signup'
          ? 'Kiểm tra email để xác thực tài khoản.'
          : mode === 'forgot'
            ? 'Nếu email hợp lệ, liên kết đặt lại mật khẩu đã được gửi.'
            : 'Đăng nhập thành công.',
      );
    } catch (error) {
      Alert.alert('Không thể tiếp tục', error instanceof Error ? error.message : 'Thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  if (authenticated === null) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#E86A4C" />
      </View>
    );
  }

  if (authenticated) {
    return (
      <View style={styles.container}>
        <Text style={styles.eyebrow}>EQUA · ĐÃ ĐĂNG NHẬP</Text>
        <Text style={styles.title}>Chào mừng trở lại.</Text>
        <Text style={styles.sessionText}>
          Phiên đăng nhập được lưu an toàn trên thiết bị. Các tính năng chi tiêu sẽ xuất hiện ở sprint sau.
        </Text>
        <Pressable accessibilityRole="button" style={styles.primary} onPress={() => void logout()}>
          <Text style={styles.primaryText}>Đăng xuất</Text>
        </Pressable>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>EQUA</Text>
      <Text style={styles.title}>
        {mode === 'signup'
          ? 'Split without the group chat chase.'
          : mode === 'login'
            ? 'Welcome back.'
            : 'Reset your password.'}
      </Text>
      <View style={styles.tabs}>
        {(['signup', 'login', 'forgot'] as const).map((item) => (
          <Pressable
            key={item}
            onPress={() => setMode(item)}
            style={[styles.tab, mode === item && styles.activeTab]}
          >
            <Text style={[styles.tabText, mode === item && styles.activeText]}>
              {item === 'signup' ? 'Sign up' : item === 'login' ? 'Log in' : 'Reset'}
            </Text>
          </Pressable>
        ))}
      </View>
      {mode === 'signup' && (
        <TextInput
          style={styles.input}
          placeholder="Display name"
          value={name}
          onChangeText={setName}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      {mode !== 'forgot' && (
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      )}
      <Pressable
        accessibilityRole="button"
        disabled={loading}
        style={styles.primary}
        onPress={() => {
          void submit();
        }}
      >
        <Text style={styles.primaryText}>
          {loading
            ? 'Please wait…'
            : mode === 'signup'
              ? 'Create account'
              : mode === 'login'
                ? 'Log in'
                : 'Send reset link'}
        </Text>
      </Pressable>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF6F0',
  },
  container: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#FAF6F0' },
  eyebrow: { color: '#8A4637', fontWeight: '800', letterSpacing: 2 },
  title: { marginTop: 16, color: '#241917', fontSize: 38, fontWeight: '700', lineHeight: 42 },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 30,
    marginBottom: 16,
    padding: 4,
    borderRadius: 16,
    backgroundColor: '#F0E3D5',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12 },
  activeTab: { backgroundColor: '#241917' },
  tabText: { fontWeight: '700', color: '#4D372B' },
  activeText: { color: '#FAF6F0' },
  input: {
    minHeight: 52,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#DDC9B6',
    borderRadius: 15,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    fontSize: 16,
  },
  primary: {
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 15,
    backgroundColor: '#E86A4C',
    marginTop: 6,
  },
  primaryText: { color: '#241917', fontSize: 16, fontWeight: '800' },
  sessionText: { marginTop: 16, marginBottom: 24, color: '#4D372B', fontSize: 16, lineHeight: 24 },
});

function isApiResponse(value: unknown): value is ApiResponse {
  return typeof value === 'object' && value !== null;
}
