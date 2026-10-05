import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Network from 'expo-network';

import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@equa/contracts';

import type { LocalStore } from '../db/local-store';
import { humanIdentityLabel } from '../identity-label';
import type { SyncClient } from './sync-client';
import {
  createOfflineExpenseDeleteOperation,
  createOfflineExpenseOperation,
  createOfflineOperationId,
} from './offline-expense';

interface CachedGroup {
  id: string;
  name: string;
  type: string;
  imageUrl: string | null;
  members: Array<{ userId: string; role: 'admin' | 'member'; label: string }>;
}

interface CachedExpense {
  id: string;
  ownerId: string;
  payerId: string;
  amountMinor: string;
  currency: SupportedCurrency;
  description: string;
  categoryId: string | null;
  friendId: string | null;
  groupId: string | null;
  participants: Array<{ userId: string; shareMinor: string }>;
  state: 'ACTIVE' | 'UPDATED' | 'DELETED';
  version: number;
  pending: boolean;
}

interface OfflineDataPanelProps {
  ownerId: string;
  apiBaseUrl: string;
  store: LocalStore | null;
  sync: SyncClient | null;
  accessToken: (refresh?: boolean) => Promise<string | null>;
  userLabels?: Record<string, string>;
}

export function OfflineDataPanel({
  ownerId,
  apiBaseUrl,
  store,
  sync,
  accessToken,
  userLabels = {},
}: OfflineDataPanelProps) {
  const tokenProvider = useRef(accessToken);
  const refreshInFlight = useRef(false);
  tokenProvider.current = accessToken;
  const [groups, setGroups] = useState<CachedGroup[]>([]);
  const [expenses, setExpenses] = useState<CachedExpense[]>([]);
  const [online, setOnline] = useState<boolean | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CachedExpense | null>(null);
  const [description, setDescription] = useState('');
  const [amountMinor, setAmountMinor] = useState('');
  const [currency, setCurrency] = useState<SupportedCurrency>('VND');
  const [groupId, setGroupId] = useState('');
  const [shares, setShares] = useState<Record<string, string>>({ [ownerId]: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadLocal = useCallback(async (): Promise<void> => {
    if (!store) return;
    const [groupRows, expenseRows] = await Promise.all([
      store.entities(ownerId, 'group:'),
      store.entities(ownerId, 'expense:'),
    ]);
    const nextGroups = groupRows.flatMap((row) => {
      const group = parseGroup(row.value);
      return group ? [group] : [];
    });
    const nextExpenses: CachedExpense[] = [];
    for (const row of expenseRows) {
      const expense = parseExpense(row.value, ownerId);
      if (!expense) continue;
      const pending = await store.hasUnresolvedMutation(ownerId, `expense:${expense.id}`);
      nextExpenses.push({ ...expense, pending });
    }
    setGroups(nextGroups);
    setExpenses(nextExpenses.sort((left, right) => right.id.localeCompare(left.id)));
  }, [ownerId, store]);

  const requestJson = useCallback(
    async (path: string): Promise<unknown> => {
      let token = await tokenProvider.current(false);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!token) throw new Error('Cần đăng nhập để tải dữ liệu máy chủ.');
        const response = await fetch(`${apiBaseUrl}/${path}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status === 401 && attempt === 0) {
          token = await tokenProvider.current(true);
          continue;
        }
        const value: unknown = await response.json();
        if (!response.ok) throw new Error('Không thể làm mới dữ liệu ngoại tuyến.');
        return value;
      }
      throw new Error('Phiên đăng nhập cần được xác thực lại.');
    },
    [apiBaseUrl],
  );

  const refreshRemote = useCallback(async (): Promise<void> => {
    if (!store || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    setError('');
    try {
      const groupValue = await requestJson('groups');
      if (!Array.isArray(groupValue) || !groupValue.every(isRecord))
        throw new Error('Danh sách nhóm không hợp lệ.');
      for (const value of groupValue) {
        if (typeof value.id !== 'string') continue;
        const cachedGroup = parseGroup(await store.entity(ownerId, `group:${value.id}`));
        let members = cachedGroup?.members ?? [];
        try {
          const memberValue = await requestJson(`groups/${encodeURIComponent(value.id)}/members`);
          if (Array.isArray(memberValue))
            members = memberValue.flatMap((entry) => {
              const member = parseMember(entry);
              return member ? [member] : [];
            });
        } catch {
          // Keep the group summary even when its member list cannot be refreshed.
        }
        await store.cacheEntity(ownerId, `group:${value.id}`, {
          id: value.id,
          name: typeof value.name === 'string' ? value.name : '',
          type: typeof value.type === 'string' ? value.type : 'other',
          imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : null,
          members,
        });
      }
      const expenseValue = await requestJson('expenses');
      if (!Array.isArray(expenseValue)) throw new Error('Danh sách khoản chi không hợp lệ.');
      for (const value of expenseValue) {
        const expense = parseExpense(value, ownerId);
        if (expense) await store.cacheEntity(ownerId, `expense:${expense.id}`, value);
      }
      setOnline(true);
      setMessage('Đã lưu nhóm và khoản chi vào SQLite trên thiết bị.');
    } catch {
      setOnline(false);
      setMessage('Không kết nối được máy chủ; đang dùng dữ liệu đã lưu trên thiết bị.');
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
      await loadLocal().catch(() => undefined);
    }
  }, [loadLocal, ownerId, requestJson, store]);

  useEffect(() => {
    if (!store) return;
    let active = true;
    const reload = (): void => {
      void loadLocal().catch(() => undefined);
    };
    const unsubscribe = store.subscribe(reload);
    void loadLocal().catch(() => undefined);
    void refreshRemote();
    void Network.getNetworkStateAsync()
      .then((state) => {
        if (active) setOnline(state.isConnected === true && state.isInternetReachable !== false);
      })
      .catch(() => {
        if (active) setOnline(undefined);
      });
    const subscription = Network.addNetworkStateListener((state) => {
      if (active) setOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    return () => {
      active = false;
      subscription.remove();
      unsubscribe();
    };
  }, [loadLocal, ownerId, refreshRemote, store]);

  const selectedGroup = groups.find((group) => group.id === groupId);
  const candidateIds = selectedGroup
    ? selectedGroup.members.map((member) => member.userId)
    : (editing?.participants.map((participant) => participant.userId) ?? [ownerId]);

  function startCreate(): void {
    setEditing(null);
    setDescription('');
    setAmountMinor('');
    setCurrency('VND');
    setGroupId('');
    setShares({ [ownerId]: '' });
    setError('');
    setShowForm(true);
  }

  function startEdit(expense: CachedExpense): void {
    setEditing(expense);
    setDescription(expense.description);
    setAmountMinor(expense.amountMinor);
    setCurrency(expense.currency);
    setGroupId(expense.groupId ?? '');
    setShares(
      Object.fromEntries(
        expense.participants.map((participant) => [participant.userId, participant.shareMinor]),
      ),
    );
    setError('');
    setShowForm(true);
  }

  function selectGroup(nextGroupId: string): void {
    setGroupId(nextGroupId);
    const nextGroup = groups.find((group) => group.id === nextGroupId);
    if (nextGroup)
      setShares((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([userId]) =>
            nextGroup.members.some((member) => member.userId === userId),
          ),
        ),
      );
    else if (!editing) setShares({ [ownerId]: amountMinor });
  }

  function toggleParticipant(userId: string): void {
    if (userId === ownerId) return;
    setShares((current) => {
      const next = { ...current };
      if (userId in next) delete next[userId];
      else next[userId] = '';
      return next;
    });
  }

  async function saveOfflineExpense(): Promise<void> {
    if (!store) return;
    setError('');
    try {
      const expenseId = editing?.id ?? createOfflineOperationId();
      const operation = createOfflineExpenseOperation({
        operationId: createOfflineOperationId(),
        expenseId,
        expectedVersion: editing?.version ?? 0,
        createdAt: new Date().toISOString(),
        description,
        amountMinor,
        currency,
        payerId: editing?.payerId ?? ownerId,
        participants: Object.entries(shares).map(([userId, shareMinor]) => ({
          userId,
          shareMinor,
        })),
        ...(groupId ? { groupId } : {}),
        ...(editing?.friendId ? { friendId: editing.friendId } : {}),
        ...(editing?.categoryId ? { categoryId: editing.categoryId } : {}),
      });
      const deviceId = await store.primaryDevice(ownerId);
      if (!deviceId) throw new Error('Không thể tạo định danh thiết bị đồng bộ.');
      await store.mutate(ownerId, deviceId, operation);
      setMessage('Đã lưu thay đổi cục bộ; hàng đợi sẽ đồng bộ khi có mạng.');
      setShowForm(false);
      setEditing(null);
      await loadLocal();
      void sync?.flush(ownerId).catch(() => undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu ngoại tuyến.');
    }
  }

  function confirmOfflineDelete(expense: CachedExpense): void {
    Alert.alert('Xóa khoản chi?', 'Thao tác sẽ đồng bộ lên máy chủ khi có mạng.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => void deleteOfflineExpense(expense) },
    ]);
  }

  async function deleteOfflineExpense(expense: CachedExpense): Promise<void> {
    if (!store || expense.pending || expense.version < 1) return;
    setError('');
    try {
      const deviceId = await store.primaryDevice(ownerId);
      if (!deviceId) throw new Error('Không tìm thấy thiết bị đồng bộ.');
      const operation = createOfflineExpenseDeleteOperation({
        operationId: createOfflineOperationId(),
        createdAt: new Date().toISOString(),
        expense,
      });
      await store.mutate(ownerId, deviceId, operation);
      setMessage('Đã xóa trên thiết bị; hàng đợi sẽ đồng bộ khi có mạng.');
      await loadLocal();
      void sync?.flush(ownerId).catch(() => undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa khoản chi ngoại tuyến.');
    }
  }

  const visibleExpenses = expenses.filter((expense) => expense.state !== 'DELETED');
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.title}>Nhóm và khoản chi ngoại tuyến</Text>
          <Text style={styles.status}>
            {online === false ? 'Ngoại tuyến · dữ liệu đã lưu' : 'Dữ liệu lưu cục bộ'}
          </Text>
        </View>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => void refreshRemote()}
          disabled={refreshing}
        >
          <Text style={styles.secondaryButtonText}>{refreshing ? 'Đang tải…' : 'Làm mới'}</Text>
        </Pressable>
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.sectionTitle}>Nhóm đã lưu ({groups.length})</Text>
      {groups.map((group) => (
        <Text key={group.id} style={styles.rowText}>
          {group.name} · {group.members.length} thành viên
        </Text>
      ))}
      <View style={styles.expenseHeader}>
        <Text style={styles.sectionTitle}>Khoản chi đã lưu ({visibleExpenses.length})</Text>
        <Pressable style={styles.secondaryButton} onPress={startCreate}>
          <Text style={styles.secondaryButtonText}>Thêm ngoại tuyến</Text>
        </Pressable>
      </View>
      {!visibleExpenses.length ? (
        <Text style={styles.rowText}>Chưa có khoản chi trong bộ nhớ cục bộ.</Text>
      ) : null}
      {visibleExpenses.map((expense) => (
        <View key={expense.id} style={styles.expenseRow}>
          <View style={styles.flex}>
            <Text style={styles.rowText}>{expense.description || 'Khoản chi'}</Text>
            <Text style={styles.meta}>
              {expense.amountMinor} {expense.currency} ·{' '}
              {expense.pending ? 'Chờ đồng bộ' : 'Đã lưu'}
            </Text>
          </View>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void startEdit(expense)}
            disabled={expense.pending || expense.version < 1}
          >
            <Text style={styles.secondaryButtonText}>Sửa</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => confirmOfflineDelete(expense)}
            disabled={expense.pending || expense.version < 1}
          >
            <Text style={styles.secondaryButtonText}>Xóa</Text>
          </Pressable>
        </View>
      ))}
      {showForm && (
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>
            {editing ? 'Sửa khoản chi ngoại tuyến' : 'Tạo khoản chi ngoại tuyến'}
          </Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Mô tả"
          />
          <Text style={styles.fieldLabel}>Số tiền (minor unit, số nguyên)</Text>
          <TextInput
            style={styles.input}
            value={amountMinor}
            onChangeText={(value) => {
              setAmountMinor(value);
              if (Object.keys(shares).length === 1 && ownerId in shares)
                setShares({ [ownerId]: value });
            }}
            keyboardType="number-pad"
            placeholder="1200"
          />
          <Text style={styles.fieldLabel}>Tiền tệ</Text>
          <ScrollView horizontal contentContainerStyle={styles.chips}>
            {SUPPORTED_CURRENCIES.map((item) => (
              <Pressable
                key={item}
                style={[styles.chip, currency === item && styles.chipSelected]}
                onPress={() => setCurrency(item)}
              >
                <Text style={styles.chipText}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.fieldLabel}>Nhóm</Text>
          <ScrollView horizontal contentContainerStyle={styles.chips}>
            <Pressable
              style={[styles.chip, !groupId && styles.chipSelected]}
              onPress={() => selectGroup('')}
            >
              <Text style={styles.chipText}>Cá nhân</Text>
            </Pressable>
            {groups.map((group) => (
              <Pressable
                key={group.id}
                style={[styles.chip, groupId === group.id && styles.chipSelected]}
                onPress={() => selectGroup(group.id)}
              >
                <Text style={styles.chipText}>{group.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.fieldLabel}>Người trả: Bạn</Text>
          <Text style={styles.fieldLabel}>Người tham gia và phần chia (minor unit)</Text>
          {candidateIds.map((userId) => (
            <View key={userId} style={styles.shareRow}>
              <Pressable
                style={styles.flex}
                onPress={() => toggleParticipant(userId)}
                disabled={userId === ownerId}
              >
                <Text style={styles.rowText}>
                  {userId === ownerId
                    ? '✓ Bạn'
                    : `${userId in shares ? '✓' : '□'} ${userLabels[userId] ?? groups.find((group) => group.id === groupId)?.members.find((member) => member.userId === userId)?.label ?? 'Người dùng Equa'}`}
                </Text>
              </Pressable>
              {userId in shares ? (
                <TextInput
                  style={styles.shareInput}
                  value={shares[userId]}
                  onChangeText={(value) =>
                    setShares((current) => ({ ...current, [userId]: value }))
                  }
                  keyboardType="number-pad"
                  placeholder="Phần chia"
                />
              ) : null}
            </View>
          ))}
          <View style={styles.formActions}>
            <Pressable style={styles.primaryButton} onPress={() => void saveOfflineExpense()}>
              <Text style={styles.primaryButtonText}>Lưu vào thiết bị</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              <Text style={styles.secondaryButtonText}>Hủy</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function parseGroup(value: unknown): CachedGroup | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string')
    return undefined;
  const members = Array.isArray(value.members)
    ? value.members.flatMap((entry) => {
        const member = parseMember(entry);
        return member ? [member] : [];
      })
    : [];
  return {
    id: value.id,
    name: value.name,
    type: typeof value.type === 'string' ? value.type : 'other',
    imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : null,
    members,
  };
}

function parseMember(
  value: unknown,
): { userId: string; role: 'admin' | 'member'; label: string } | undefined {
  if (
    !isRecord(value) ||
    typeof value.userId !== 'string' ||
    (value.role !== 'admin' && value.role !== 'member')
  )
    return undefined;
  const identity = isRecord(value.user) ? value.user : undefined;
  const label = humanIdentityLabel({
    displayName: typeof identity?.displayName === 'string' ? identity.displayName : undefined,
    email: typeof identity?.email === 'string' ? identity.email : undefined,
    username: typeof identity?.username === 'string' ? identity.username : undefined,
  });
  return { userId: value.userId, role: value.role, label };
}

function parseExpense(value: unknown, ownerId: string): Omit<CachedExpense, 'pending'> | undefined {
  if (
    !isRecord(value) ||
    typeof (value.id ?? value.expenseId) !== 'string' ||
    typeof value.amountMinor !== 'string' ||
    !SUPPORTED_CURRENCIES.includes(value.currency as SupportedCurrency) ||
    typeof value.payerId !== 'string'
  )
    return undefined;
  const participants = Array.isArray(value.participants)
    ? value.participants.flatMap((entry) =>
        isRecord(entry) && typeof entry.userId === 'string' && typeof entry.shareMinor === 'string'
          ? [{ userId: entry.userId, shareMinor: entry.shareMinor }]
          : [],
      )
    : [];
  return {
    id: typeof value.id === 'string' ? value.id : (value.expenseId as string),
    ownerId: typeof value.ownerId === 'string' ? value.ownerId : ownerId,
    payerId: value.payerId,
    amountMinor: value.amountMinor,
    currency: value.currency as SupportedCurrency,
    description: typeof value.description === 'string' ? value.description : '',
    categoryId: typeof value.categoryId === 'string' ? value.categoryId : null,
    friendId: typeof value.friendId === 'string' ? value.friendId : null,
    groupId: typeof value.groupId === 'string' ? value.groupId : null,
    participants,
    state: value.state === 'DELETED' ? 'DELETED' : value.state === 'UPDATED' ? 'UPDATED' : 'ACTIVE',
    version:
      typeof value.version === 'number' && Number.isSafeInteger(value.version) ? value.version : 0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#FFFDFB',
    borderWidth: 1,
    borderColor: '#E9E0D8',
    borderRadius: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  title: { color: '#241917', fontSize: 17, fontWeight: '800' },
  status: { marginTop: 4, color: '#776A60', fontSize: 12 },
  message: { marginTop: 10, color: '#33614D', fontSize: 12 },
  error: { marginTop: 10, color: '#A23D31', fontSize: 12 },
  sectionTitle: {
    marginTop: 14,
    marginBottom: 7,
    color: '#4A3A33',
    fontSize: 13,
    fontWeight: '800',
  },
  rowText: { color: '#31251F', fontSize: 13 },
  meta: { marginTop: 3, color: '#7D7067', fontSize: 11 },
  expenseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#F0EAE4',
  },
  form: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E9E0D8' },
  fieldLabel: { marginTop: 10, marginBottom: 5, color: '#62554C', fontSize: 12, fontWeight: '700' },
  input: {
    minHeight: 42,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#DDD2C8',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    color: '#241917',
  },
  chips: { gap: 7, paddingVertical: 3 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#D9CCC1',
    borderRadius: 18,
  },
  chipSelected: { backgroundColor: '#F7E8DF', borderColor: '#C96B4C' },
  chipText: { color: '#49382F', fontSize: 12 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  shareInput: {
    width: 130,
    height: 38,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: '#DDD2C8',
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    color: '#241917',
    textAlign: 'right',
  },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  primaryButton: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#C96B4C',
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  secondaryButton: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D9CCC1',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: { color: '#49382F', fontSize: 12, fontWeight: '700' },
});
