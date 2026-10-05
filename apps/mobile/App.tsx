import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Pressable,
  Platform,
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
import { LocalStore, type LocalConflictSummary } from './src/db/local-store';
import { MobileApiClient } from './src/api/mobile-api';
import { resolveApiBaseUrl } from './src/api/api-base-url';
import { createSyncTransport } from './src/api/sync-api';
import { createExpoConnectivity } from './src/sync/expo-connectivity';
import { SyncClient } from './src/sync/sync-client';
import { ExpensesScreen } from './src/screens/expenses-screen';
import { FriendsScreen } from './src/screens/friends-screen';
import { GroupsScreen } from './src/screens/groups-screen';
import { HomeScreen } from './src/screens/home-screen';

declare const process: { env: Record<string, string | undefined> };

const apiBaseUrl = resolveApiBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL,
  __DEV__,
  Platform.OS === 'android' ? 'android' : 'other',
);
const accessTokenKey = 'equa_access_token';
const mobileAuthApi = createMobileAuthApi(apiBaseUrl);
const connectivity = createExpoConnectivity();
type Mode = 'signup' | 'login' | 'forgot';
type AppTab = 'home' | 'friends' | 'groups' | 'expenses' | 'profile';
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
  const [activeTab, setActiveTab] = useState<AppTab>('home');

  // Profile state
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [syncOwner, setSyncOwner] = useState<string | null>(null);
  const [syncConflicts, setSyncConflicts] = useState<LocalConflictSummary[]>([]);

  // Form state
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formBio, setFormBio] = useState('');
  const [formCurrency, setFormCurrency] = useState<SupportedCurrency>('VND');
  const [formLanguage, setFormLanguage] = useState<SupportedLanguage>('vi');
  const [formTimezone, setFormTimezone] = useState('Asia/Ho_Chi_Minh');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const syncRef = useRef<SyncClient | null>(null);
  const localStoreRef = useRef<LocalStore | null>(null);
  const ownerRef = useRef<string | null>(null);
  const sessionRef = useRef<SessionManager | null>(null);
  const apiRef = useRef<MobileApiClient | null>(null);
  const profileRequestGenerationRef = useRef(0);

  if (!sessionRef.current) {
    sessionRef.current = new SessionManager(mobileAuthApi);
  }
  if (!apiRef.current) {
    apiRef.current = new MobileApiClient(apiBaseUrl, (refresh) => syncToken(refresh));
  }

  useEffect(() => {
    const epoch = 0;
    void SecureStore.getItemAsync(accessTokenKey).then(async (token) => {
      if (!sessionRef.current?.isCurrent(epoch)) return;
      ownerRef.current = token ? (accountHint(token) ?? null) : null;
      setSyncOwner(ownerRef.current);
      if (token && ownerRef.current) {
        const store = await LocalStore.open();
        if (!sessionRef.current?.isCurrent(epoch)) return;
        localStoreRef.current = store;
        await store.restoreQuarantined(ownerRef.current);
        if (!sessionRef.current?.isCurrent(epoch)) return;
        syncRef.current = new SyncClient(
          store,
          createSyncTransport(apiBaseUrl),
          (refresh) => syncToken(refresh),
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

  useEffect(() => {
    const client = syncRef.current;
    if (!authenticated || !syncOwner || !client) {
      setSyncConflicts([]);
      return;
    }
    let active = true;
    const refreshConflicts = (): void => {
      void client
        .conflictSummaries(syncOwner)
        .then((items) => {
          if (active) setSyncConflicts(items);
        })
        .catch(() => undefined);
    };
    refreshConflicts();
    const unsubscribe = client.subscribe(refreshConflicts);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [authenticated, syncOwner]);

  // Fetch profile when authenticated
  useEffect(() => {
    if (!authenticated) return;
    void loadProfile();
  }, [authenticated]);

  async function loadProfile() {
    const requestGeneration = ++profileRequestGenerationRef.current;
    const sessionEpoch = sessionRef.current?.currentEpoch();
    const ownerId = ownerRef.current;
    const isCurrent = (): boolean =>
      sessionEpoch !== undefined &&
      sessionRef.current?.isCurrent(sessionEpoch) === true &&
      ownerRef.current === ownerId &&
      profileRequestGenerationRef.current === requestGeneration;
    setProfileLoading(true);
    setMessage('');
    try {
      let token = await syncToken(false);
      if (!isCurrent()) return;
      if (!token) throw new Error('No access token.');

      let response = await fetch(`${apiBaseUrl}/profile/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        token = await syncToken(true);
        if (!isCurrent() || !token) return;
        response = await fetch(`${apiBaseUrl}/profile/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
          await logout();
          return;
        }
      }

      const result: unknown = await response.json();
      if (!response.ok || !isProfileData(result)) throw new Error('Không thể tải hồ sơ.');

      if (!isCurrent()) return;
      if (result.id !== ownerId) throw new Error('Profile session mismatch.');
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
        if (isCurrent() && avatarResponse.ok) {
          const avatarResult: unknown = await avatarResponse.json();
          if (isCurrent() && isAvatarUrlResponse(avatarResult)) {
            setAvatarUrl(avatarResult.url);
          }
        }
      }
    } catch (error) {
      if (isCurrent()) setMessage(error instanceof Error ? error.message : 'Không thể tải hồ sơ.');
    } finally {
      if (isCurrent()) setProfileLoading(false);
    }
  }

  async function saveProfile() {
    const requestGeneration = profileRequestGenerationRef.current;
    const sessionEpoch = sessionRef.current?.currentEpoch();
    const ownerId = ownerRef.current;
    const isCurrent = (): boolean =>
      sessionEpoch !== undefined &&
      sessionRef.current?.isCurrent(sessionEpoch) === true &&
      ownerRef.current === ownerId &&
      profileRequestGenerationRef.current === requestGeneration;
    setSaving(true);
    setMessage('');
    try {
      let token = await syncToken(false);
      if (!isCurrent()) return;
      if (!token) throw new Error('No access token.');

      let response = await fetch(`${apiBaseUrl}/profile/me`, {
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
        token = await syncToken(true);
        if (!isCurrent() || !token) return;
        response = await fetch(`${apiBaseUrl}/profile/me`, {
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
      }

      const result: unknown = await response.json();
      if (!response.ok || !isProfileData(result)) throw new Error('Không thể lưu hồ sơ.');

      if (!isCurrent()) return;
      if (result.id !== ownerId) throw new Error('Profile session mismatch.');
      setProfile(result);
      setMessage('Đã lưu thay đổi hồ sơ.');
    } catch (error) {
      if (isCurrent()) setMessage(error instanceof Error ? error.message : 'Không thể lưu hồ sơ.');
    } finally {
      if (isCurrent()) setSaving(false);
    }
  }

  async function pickAndUploadAvatar() {
    const requestGeneration = profileRequestGenerationRef.current;
    const sessionEpoch = sessionRef.current?.currentEpoch();
    const ownerId = ownerRef.current;
    const isCurrent = (): boolean =>
      sessionEpoch !== undefined &&
      sessionRef.current?.isCurrent(sessionEpoch) === true &&
      ownerRef.current === ownerId &&
      profileRequestGenerationRef.current === requestGeneration;
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

    if (!isCurrent()) return;
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
      Alert.alert('File quá lớn', 'Avatar tối đa 2 MB.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      let token = await syncToken(false);
      if (!isCurrent()) return;
      if (!token) throw new Error('No access token.');

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: asset.mimeType ?? 'image/jpeg',
        name: asset.fileName ?? 'avatar.jpg',
      } as unknown as Blob);

      let response = await fetch(`${apiBaseUrl}/profile/me/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!isCurrent()) return;

      if (response.status === 401) {
        token = await syncToken(true);
        if (!isCurrent() || !token) return;
        response = await fetch(`${apiBaseUrl}/profile/me/avatar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (response.status === 401) {
          await logout();
          return;
        }
      }

      const result: unknown = await response.json();
      if (!response.ok || !isProfileData(result)) throw new Error('Không thể tải avatar.');

      if (!isCurrent()) return;
      setProfile(result);

      let avatarResponse = await fetch(`${apiBaseUrl}/profile/me/avatar-url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (avatarResponse.status === 401) {
        token = await syncToken(true);
        if (!isCurrent() || !token) return;
        avatarResponse = await fetch(`${apiBaseUrl}/profile/me/avatar-url`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (isCurrent() && avatarResponse.ok) {
        const avatarResult: unknown = await avatarResponse.json();
        if (isCurrent() && isAvatarUrlResponse(avatarResult)) {
          setAvatarUrl(avatarResult.url);
        }
      }

      setMessage('Đã tải avatar lên MinIO.');
    } catch (error) {
      if (isCurrent()) setMessage(error instanceof Error ? error.message : 'Không thể tải avatar.');
    } finally {
      if (isCurrent()) setSaving(false);
    }
  }

  async function logout() {
    profileRequestGenerationRef.current += 1;
    setSaving(false);
    const ownerId = ownerRef.current;
    const clearSession = sessionRef.current?.logout();
    ownerRef.current = null;
    localStoreRef.current = null;
    setSyncOwner(null);
    setSyncConflicts([]);
    syncRef.current?.stop();
    let warning = '';
    try {
      if (ownerId) {
        const store = await LocalStore.open();
        await store.quarantine(ownerId);
      }
    } catch {
      warning =
        'Hàng đợi vẫn được giữ cục bộ; hãy đăng nhập lại cùng tài khoản để tiếp tục đồng bộ.';
    }
    try {
      const revoked = await clearSession;
      if (!revoked)
        warning =
          'Đã đăng xuất trên thiết bị; máy chủ chưa xác nhận thu hồi phiên vì không kết nối được.';
    } catch {
      warning =
        'Không thể xóa an toàn thông tin phiên. Hãy thử đăng xuất lại khi thiết bị ổn định.';
    }
    setPassword('');
    setProfile(null);
    setAvatarUrl(null);
    setActiveTab('home');
    setMessage(warning);
    setAuthenticated(false);
  }

  async function syncToken(refresh = false): Promise<string | null> {
    const session = sessionRef.current;
    if (!session) return null;
    try {
      return await session.token(refresh);
    } catch (error) {
      if (refresh && ownerRef.current) {
        await logout();
        setMessage(
          'Phiên đăng nhập cần được xác thực lại. Hàng đợi cục bộ được giữ riêng theo tài khoản.',
        );
      }
      throw error;
    }
  }

  function confirmUseServerVersion(conflict: LocalConflictSummary): void {
    Alert.alert(
      'Xung đột phiên bản',
      `Bỏ sửa cục bộ cho ${conflict.description ?? 'khoản chi'} và dùng dữ liệu mới nhất từ máy chủ?`,
      [
        { text: 'Giữ để xem lại', style: 'cancel' },
        {
          text: 'Dùng dữ liệu máy chủ',
          style: 'destructive',
          onPress: () => {
            void resolveConflict(conflict);
          },
        },
      ],
    );
  }

  async function resolveConflict(conflict: LocalConflictSummary): Promise<void> {
    const ownerId = ownerRef.current;
    const client = syncRef.current;
    if (!ownerId || !client) return;
    try {
      await client.resolveConflict(ownerId, conflict);
      setMessage('Đã bỏ bản sửa cục bộ. Phiên bản máy chủ sẽ được đồng bộ lại.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể giải quyết xung đột.');
    }
  }

  const submit = async () => {
    const sessionEpoch = mode === 'login' ? sessionRef.current?.begin() : undefined;
    if (mode === 'login') {
      ownerRef.current = null;
      setSyncOwner(null);
      setSyncConflicts([]);
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
          openStore: async (ownerId) => {
            const store = await LocalStore.open();
            if (sessionRef.current?.isCurrent(sessionEpoch)) {
              localStoreRef.current = store;
              await store.restoreQuarantined(ownerId);
            }
            return store;
          },
          createClient: (store) =>
            new SyncClient(
              store,
              createSyncTransport(apiBaseUrl),
              (refresh) => syncToken(refresh),
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
            setSyncOwner(ownerId);
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

    const api = apiRef.current;
    const currentUserId = profile?.id ?? syncOwner ?? '';
    const conflictCard =
      syncConflicts.length > 0 ? (
        <View style={styles.syncConflictCard}>
          <Text style={styles.syncConflictTitle}>
            Cần xem lại {syncConflicts.length} xung đột đồng bộ
          </Text>
          <Text style={styles.syncConflictHint}>
            Bản sửa trên thiết bị vẫn được giữ. Chọn dùng dữ liệu máy chủ để bỏ bản sửa cục bộ.
          </Text>
          {syncConflicts.map((conflict) => (
            <View style={styles.syncConflictRow} key={conflict.operationId}>
              <View style={styles.syncConflictCopy}>
                <Text style={styles.syncConflictName}>{conflict.description ?? 'Khoản chi'}</Text>
                <Text style={styles.syncConflictMeta}>
                  Phiên bản gửi {conflict.expectedVersion ?? 'không rõ'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                style={styles.syncConflictButton}
                onPress={() => confirmUseServerVersion(conflict)}
              >
                <Text style={styles.syncConflictButtonText}>Dùng máy chủ</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null;

    if (activeTab !== 'profile') {
      return (
        <View style={styles.appShell}>
          <MainNavigation activeTab={activeTab} onSelect={setActiveTab} />
          {conflictCard}
          {api && activeTab === 'home' ? (
            <HomeScreen api={api} displayName={profile?.displayName ?? 'Bạn'} />
          ) : null}
          {api && activeTab === 'friends' ? (
            <FriendsScreen api={api} currentUserId={currentUserId} />
          ) : null}
          {api && activeTab === 'groups' ? (
            <GroupsScreen api={api} currentUserId={currentUserId} />
          ) : null}
          {api && activeTab === 'expenses' ? (
            <ExpensesScreen
              api={api}
              apiBaseUrl={apiBaseUrl}
              currentUserId={currentUserId}
              displayName={profile?.displayName ?? 'Bạn'}
              store={localStoreRef.current}
              sync={syncRef.current}
              accessToken={(refresh) => syncToken(refresh)}
            />
          ) : null}
          <StatusBar style="dark" />
        </View>
      );
    }

    return (
      <View style={styles.appShell}>
        <MainNavigation activeTab={activeTab} onSelect={setActiveTab} />
        {conflictCard}
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
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>EQUA</Text>
        <Text style={styles.title}>
          {mode === 'signup'
            ? 'Cùng quản lý khoản chi chung.'
            : mode === 'login'
              ? 'Chào mừng trở lại.'
              : 'Đặt lại mật khẩu.'}
        </Text>
        <View style={styles.tabs}>
          {(['signup', 'login', 'forgot'] as const).map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === item }}
              onPress={() => setMode(item)}
              style={[styles.tab, mode === item && styles.activeTab]}
            >
              <Text style={[styles.tabText, mode === item && styles.activeText]}>
                {item === 'signup' ? 'Đăng ký' : item === 'login' ? 'Đăng nhập' : 'Quên mật khẩu'}
              </Text>
            </Pressable>
          ))}
        </View>
        {mode === 'signup' && (
          <TextInput
            style={styles.input}
            accessibilityLabel="Tên hiển thị"
            placeholder="Tên hiển thị"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="next"
          />
        )}
        <TextInput
          style={styles.input}
          accessibilityLabel="Email"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        {mode !== 'forgot' && (
          <TextInput
            style={styles.input}
            accessibilityLabel="Mật khẩu"
            placeholder="Mật khẩu"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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
              ? 'Đang xử lý…'
              : mode === 'signup'
                ? 'Tạo tài khoản'
                : mode === 'login'
                  ? 'Đăng nhập'
                  : 'Gửi liên kết đặt lại'}
          </Text>
        </Pressable>
        <StatusBar style="dark" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MainNavigation({
  activeTab,
  onSelect,
}: {
  activeTab: AppTab;
  onSelect: (tab: AppTab) => void;
}) {
  const tabs: Array<{ id: AppTab; label: string }> = [
    { id: 'home', label: 'Tổng quan' },
    { id: 'friends', label: 'Bạn bè' },
    { id: 'groups', label: 'Nhóm' },
    { id: 'expenses', label: 'Khoản chi' },
    { id: 'profile', label: 'Hồ sơ' },
  ];
  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.navigation}
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Điều hướng Equa"
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.id}
          accessibilityRole="button"
          accessibilityState={{ selected: activeTab === tab.id }}
          onPress={() => onSelect(tab.id)}
          style={[styles.navigationTab, activeTab === tab.id && styles.navigationTabActive]}
        >
          <Text
            style={[styles.navigationText, activeTab === tab.id && styles.navigationTextActive]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
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
  appShell: { flex: 1, backgroundColor: '#FAF6F0' },
  container: { flex: 1, backgroundColor: '#FAF6F0' },
  authContent: { flexGrow: 1, justifyContent: 'center', padding: 28, paddingBottom: 50 },
  scrollContent: { padding: 28, paddingBottom: 60 },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#DDC9B6',
    backgroundColor: '#FFFDFB',
  },
  navigationTab: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18 },
  navigationTabActive: { backgroundColor: '#E4F1EB' },
  navigationText: { color: '#71645B', fontSize: 12, fontWeight: '700' },
  navigationTextActive: { color: '#287A62' },
  eyebrow: { color: '#8A4637', fontWeight: '800', letterSpacing: 2, marginTop: 20 },
  title: {
    marginTop: 16,
    color: '#241917',
    fontSize: 38,
    fontWeight: '700',
    lineHeight: 42,
    marginBottom: 24,
  },
  syncConflictCard: {
    marginBottom: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#D9A35E',
    borderRadius: 16,
    backgroundColor: '#FFF3DF',
  },
  syncConflictTitle: { color: '#49382F', fontSize: 16, fontWeight: '800' },
  syncConflictHint: { marginTop: 6, color: '#776A60', fontSize: 12, lineHeight: 18 },
  syncConflictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8D2B4',
  },
  syncConflictCopy: { flex: 1 },
  syncConflictName: { color: '#241917', fontSize: 13, fontWeight: '700' },
  syncConflictMeta: { marginTop: 3, color: '#776A60', fontSize: 10 },
  syncConflictButton: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#A34D3D',
  },
  syncConflictButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
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
