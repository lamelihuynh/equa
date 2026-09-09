import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { SUPPORTED_CURRENCIES, SUPPORTED_LANGUAGES } from '@equa/contracts';
import type { SupportedCurrency, SupportedLanguage } from '@equa/contracts';
import { createMobileAuthApi } from './src/auth/auth-api';
import { finishLoginHandoff } from './src/auth/login-handoff';
import { accountHint, SessionManager } from './src/auth/session';
import { LocalStore } from './src/db/local-store';
import { createSyncTransport } from './src/api/sync-api';
import { createExpoConnectivity } from './src/sync/expo-connectivity';
import { SyncClient } from './src/sync/sync-client';

declare const process: { env: Record<string, string | undefined> };

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/v1';
const accessTokenKey = 'equa_access_token';
const mobileAuthApi = createMobileAuthApi(apiBaseUrl);
const connectivity = createExpoConnectivity();
type Mode = 'signup' | 'login' | 'forgot';
interface ApiResponse {
  message?: string;
  accessToken?: string;
  refreshToken?: string;
}

interface ProfileData {
  id: string;
  email: string;
  displayName: string;
  avatarKey: string | null;
  bio: string;
  defaultCurrency: string;
  locale: string;
  timezone: string;
  roles: string[];
}

const languageLabels: Record<string, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  fr: 'Français',
  es: 'Español',
};

const timezoneOptions = [
  'Asia/Ho_Chi_Minh',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Europe/Paris',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
];

export default function App() {
  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  // Profile state
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Form state
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formBio, setFormBio] = useState('');
  const [formCurrency, setFormCurrency] = useState<SupportedCurrency>('VND');
  const [formLanguage, setFormLanguage] = useState<SupportedLanguage>('vi');
  const [formTimezone, setFormTimezone] = useState('Asia/Ho_Chi_Minh');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const syncRef = useRef<SyncClient | null>(null);
  const ownerRef = useRef<string | null>(null);
  const sessionRef = useRef<SessionManager | null>(null);

  if (!sessionRef.current) {
    sessionRef.current = new SessionManager(mobileAuthApi);
  }

  useEffect(() => {
    const epoch = 0;
    void SecureStore.getItemAsync(accessTokenKey).then(async (token) => {
      if (!sessionRef.current?.isCurrent(epoch)) return;
      ownerRef.current = token ? (accountHint(token) ?? null) : null;
      if (token && ownerRef.current) {
        const store = await LocalStore.open();
        syncRef.current = new SyncClient(
          store,
          createSyncTransport(apiBaseUrl),
          (refresh) => sessionRef.current!.token(refresh),
          undefined,
          connectivity,
        );
        syncRef.current.start(ownerRef.current);
      }
      if (sessionRef.current?.isCurrent(epoch)) setAuthenticated(Boolean(token));
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && ownerRef.current) syncRef.current?.reconnect(ownerRef.current);
    });
    return () => subscription.remove();
  }, []);

  // Fetch profile when authenticated
  useEffect(() => {
    if (!authenticated) return;
    void loadProfile();
  }, [authenticated]);

  async function loadProfile() {
    setProfileLoading(true);
    setMessage('');
    try {
      const token = await SecureStore.getItemAsync(accessTokenKey);
      if (!token) throw new Error('No access token.');

      const response = await fetch(`${apiBaseUrl}/profile/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        await logout();
        return;
      }

      const result: unknown = await response.json();
      if (!response.ok || !isProfileData(result)) throw new Error('Không thể tải hồ sơ.');

      setProfile(result);
      setFormDisplayName(result.displayName);
      setFormBio(result.bio);
      setFormCurrency(result.defaultCurrency as SupportedCurrency);
      setFormLanguage(result.locale as SupportedLanguage);
      setFormTimezone(result.timezone);

      if (result.avatarKey) {
        const avatarResponse = await fetch(`${apiBaseUrl}/profile/me/avatar-url`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (avatarResponse.ok) {
          const avatarResult: unknown = await avatarResponse.json();
          if (isAvatarUrlResponse(avatarResult)) {
            setAvatarUrl(avatarResult.url);
          }
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tải hồ sơ.');
    } finally {
      setProfileLoading(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setMessage('');
    try {
      const token = await SecureStore.getItemAsync(accessTokenKey);
      if (!token) throw new Error('No access token.');

      const response = await fetch(`${apiBaseUrl}/profile/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: formDisplayName,
          bio: formBio,
          defaultCurrency: formCurrency,
          locale: formLanguage,
          timezone: formTimezone,
        }),
      });

      if (response.status === 401) {
        await logout();
        return;
      }

      const result: unknown = await response.json();
      if (!response.ok || !isProfileData(result)) throw new Error('Không thể lưu hồ sơ.');

      setProfile(result);
      setMessage('Đã lưu thay đổi hồ sơ.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể lưu hồ sơ.');
    } finally {
      setSaving(false);
    }
  }

  async function pickAndUploadAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền truy cập', 'Cho phép truy cập thư viện ảnh để đổi avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
      Alert.alert('File quá lớn', 'Avatar tối đa 2 MB.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const token = await SecureStore.getItemAsync(accessTokenKey);
      if (!token) throw new Error('No access token.');

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: asset.mimeType ?? 'image/jpeg',
        name: asset.fileName ?? 'avatar.jpg',
      } as unknown as Blob);

      const response = await fetch(`${apiBaseUrl}/profile/me/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.status === 401) {
        await logout();
        return;
      }

      const result: unknown = await response.json();
      if (!response.ok || !isProfileData(result)) throw new Error('Không thể tải avatar.');

      setProfile(result);

      const avatarResponse = await fetch(`${apiBaseUrl}/profile/me/avatar-url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (avatarResponse.ok) {
        const avatarResult: unknown = await avatarResponse.json();
        if (isAvatarUrlResponse(avatarResult)) {
          setAvatarUrl(avatarResult.url);
        }
      }

      setMessage('Đã tải avatar lên MinIO.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tải avatar.');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    const ownerId = ownerRef.current;
    const clearSession = sessionRef.current?.clear();
    ownerRef.current = null;
    syncRef.current?.stop();
    if (ownerId) {
      const store = await LocalStore.open();
      await store.quarantine(ownerId);
    }
    await clearSession;
    setPassword('');
    setProfile(null);
    setAvatarUrl(null);
    setMessage('');
    setAuthenticated(false);
  }

  const submit = async () => {
    const sessionEpoch = mode === 'login' ? sessionRef.current?.begin() : undefined;
    if (mode === 'login') {
      ownerRef.current = null;
      syncRef.current?.stop();
      setAuthenticated(false);
    }
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
      if (mode === 'login') {
        if (sessionEpoch === undefined) throw new Error('Session manager is unavailable.');
        const tokens = await mobileAuthApi.login(email, password);
        if (!sessionRef.current?.isCurrent(sessionEpoch)) return;
        if (!(await sessionRef.current.save(tokens, sessionEpoch))) return;
        await finishLoginHandoff({
          session: sessionRef.current,
          epoch: sessionEpoch,
          accessToken: tokens.accessToken,
          openStore: () => LocalStore.open(),
          createClient: (store) =>
            new SyncClient(
              store,
              createSyncTransport(apiBaseUrl),
              (refresh) => sessionRef.current!.token(refresh),
              undefined,
              connectivity,
            ),
          stopSync: () => syncRef.current?.stop(),
          setSync: (client) => {
            syncRef.current = client;
          },
          startSync: (client, ownerId) => client.start(ownerId),
          setOwner: (ownerId) => {
            ownerRef.current = ownerId;
          },
          setAuthenticated,
        });
        return;
      }
      const response = await fetch(`${apiBaseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Equa-Client': 'mobile' },
        body: JSON.stringify(body),
      });
      const result: unknown = await response.json();
      const apiResult = isApiResponse(result) ? result : {};
      if (!response.ok) throw new Error(apiResult.message ?? 'Không thể hoàn tất yêu cầu.');
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
    if (profileLoading) {
      return (
        <View style={styles.loadingScreen}>
          <ActivityIndicator color="#E86A4C" />
          <Text style={styles.loadingText}>Đang tải hồ sơ…</Text>
        </View>
      );
    }

    const initials = (profile?.displayName ?? '??')
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>EQUA · HỒ SƠ</Text>
        <Text style={styles.title}>Thiết lập Equa.</Text>

        {/* Avatar */}
        <Pressable
          style={styles.avatarCircle}
          onPress={() => {
            void pickAndUploadAvatar();
          }}
          disabled={saving}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={avatarImageStyle} />
          ) : (
            <Text style={styles.avatarInitials}>{initials}</Text>
          )}
          <Text style={styles.avatarBadge}>Thay</Text>
        </Pressable>

        {/* Display Name */}
        <Text style={styles.fieldLabel}>Tên hiển thị</Text>
        <TextInput
          style={styles.input}
          value={formDisplayName}
          onChangeText={setFormDisplayName}
          placeholder="Tên của bạn"
          maxLength={100}
        />

        {/* Email (read-only) */}
        <Text style={styles.fieldLabel}>Email</Text>
        <TextInput
          style={[styles.input, styles.inputDisabled]}
          value={profile?.email ?? ''}
          editable={false}
        />

        {/* Bio */}
        <Text style={styles.fieldLabel}>Giới thiệu</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={formBio}
          onChangeText={setFormBio}
          placeholder="Một chút về bạn..."
          multiline
          maxLength={500}
          textAlignVertical="top"
        />

        {/* Currency */}
        <Text style={styles.fieldLabel}>Tiền tệ mặc định</Text>
        <View style={styles.chipRow}>
          {SUPPORTED_CURRENCIES.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, formCurrency === c && styles.chipActive]}
              onPress={() => setFormCurrency(c)}
            >
              <Text style={[styles.chipText, formCurrency === c && styles.chipTextActive]}>
                {c}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Language */}
        <Text style={styles.fieldLabel}>Ngôn ngữ</Text>
        <View style={styles.chipRow}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <Pressable
              key={lang}
              style={[styles.chip, formLanguage === lang && styles.chipActive]}
              onPress={() => setFormLanguage(lang)}
            >
              <Text style={[styles.chipText, formLanguage === lang && styles.chipTextActive]}>
                {languageLabels[lang] ?? lang}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Timezone */}
        <Text style={styles.fieldLabel}>Múi giờ</Text>
        <View style={styles.chipRow}>
          {timezoneOptions.map((tz) => (
            <Pressable
              key={tz}
              style={[styles.chip, formTimezone === tz && styles.chipActive]}
              onPress={() => setFormTimezone(tz)}
            >
              <Text
                style={[
                  styles.chipText,
                  styles.chipTextSmall,
                  formTimezone === tz && styles.chipTextActive,
                ]}
                numberOfLines={1}
              >
                {tz
                  .replace('Asia/', '')
                  .replace('America/', '')
                  .replace('Europe/', '')
                  .replace('_', ' ')}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Message */}
        {message !== '' && <Text style={styles.formMessage}>{message}</Text>}

        {/* Save */}
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          style={styles.primary}
          onPress={() => {
            void saveProfile();
          }}
        >
          <Text style={styles.primaryText}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</Text>
        </Pressable>

        {/* Logout */}
        <Pressable
          accessibilityRole="button"
          style={styles.logoutButton}
          onPress={() => {
            void logout();
          }}
        >
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </Pressable>

        <StatusBar style="dark" />
      </ScrollView>
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

const avatarImageStyle = { width: '100%', height: '100%', borderRadius: 28 } as const;

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF6F0',
  },
  loadingText: {
    marginTop: 16,
    color: '#2A7761',
    fontSize: 15,
    fontWeight: '700',
  },
  container: { flex: 1, backgroundColor: '#FAF6F0' },
  scrollContent: { padding: 28, paddingBottom: 60 },
  eyebrow: { color: '#8A4637', fontWeight: '800', letterSpacing: 2, marginTop: 20 },
  title: {
    marginTop: 16,
    color: '#241917',
    fontSize: 38,
    fontWeight: '700',
    lineHeight: 42,
    marginBottom: 24,
  },
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
    color: '#241917',
  },
  inputDisabled: {
    color: '#8A7C70',
    backgroundColor: '#F5EEE6',
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

  // Profile form styles
  fieldLabel: {
    color: '#49382F',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginTop: 8,
  },
  textarea: {
    height: 90,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDC9B6',
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: '#241917',
    borderColor: '#241917',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4D372B',
  },
  chipTextSmall: {
    fontSize: 12,
  },
  chipTextActive: {
    color: '#FAF6F0',
  },
  formMessage: {
    marginTop: 12,
    marginBottom: 4,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#F4E2CF',
    color: '#55392D',
    fontSize: 14,
    lineHeight: 20,
    borderWidth: 1,
    borderColor: '#E1C8AE',
  },
  avatarCircle: {
    position: 'relative',
    alignSelf: 'center',
    width: 86,
    height: 86,
    borderRadius: 28,
    backgroundColor: '#305956',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    overflow: 'hidden',
  },
  avatarInitials: {
    color: '#FAFAF3',
    fontSize: 25,
    fontWeight: '800',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 6,
    backgroundColor: 'rgba(28,45,43,0.76)',
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  logoutButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#DDC9B6',
    backgroundColor: '#fff',
  },
  logoutText: {
    color: '#8A4637',
    fontSize: 15,
    fontWeight: '700',
  },
});

function isApiResponse(value: unknown): value is ApiResponse {
  return typeof value === 'object' && value !== null;
}

function isProfileData(value: unknown): value is ProfileData {
  return typeof value === 'object' && value !== null && 'email' in value && 'displayName' in value;
}

function isAvatarUrlResponse(value: unknown): value is { url: string } {
  return (
    typeof value === 'object' && value !== null && 'url' in value && typeof value.url === 'string'
  );
}
