import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { SUPPORTED_CURRENCIES } from '@equa/contracts';
import type { SupportedCurrency } from '@equa/contracts';

import type {
  CategoryDto,
  CreateExpenseDto,
  ExpenseDto,
  FriendshipDto,
  GroupDto,
  GroupMemberDto,
  MobileApiClient,
  UpdateExpenseDto,
} from '../api/mobile-api';
import type { LocalStore } from '../db/local-store';
import { humanIdentityLabel } from '../identity-label';
import { createOfflineOperationId } from '../sync/offline-expense';
import { OfflineDataPanel } from '../sync/offline-data-panel';
import type { SyncClient } from '../sync/sync-client';
import { formatMinor, inputFromMinor, minorFromInput } from '../money';
import {
  Button,
  Card,
  ChoiceChip,
  Feedback,
  Field,
  LoadingState,
  MutedText,
  Screen,
  ScreenTitle,
  SectionTitle,
  mobileColors,
} from './screen-primitives';

interface ExpensesScreenProps {
  api: MobileApiClient;
  apiBaseUrl: string;
  currentUserId: string;
  displayName: string;
  store: LocalStore | null;
  sync: SyncClient | null;
  accessToken: (refresh?: boolean) => Promise<string | null>;
}

export function ExpensesScreen({
  api,
  apiBaseUrl,
  currentUserId,
  displayName,
  store,
  sync,
  accessToken,
}: ExpensesScreenProps) {
  const [expenses, setExpenses] = useState<ExpenseDto[]>([]);
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [friends, setFriends] = useState<FriendshipDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [members, setMembers] = useState<GroupMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [editing, setEditing] = useState<ExpenseDto | null>(null);
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [currency, setCurrency] = useState<SupportedCurrency>('VND');
  const [categoryId, setCategoryId] = useState('other');
  const [groupId, setGroupId] = useState('');
  const [friendId, setFriendId] = useState('');
  const [payerId, setPayerId] = useState(currentUserId);
  const [participants, setParticipants] = useState<Record<string, boolean>>({
    [currentUserId]: true,
  });
  const [shares, setShares] = useState<Record<string, string>>({ [currentUserId]: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const mutationKey = useRef<{ payload: string; key: string } | null>(null);
  const deleteKeys = useRef(new Map<string, string>());

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const [nextExpenses, nextGroups, nextFriends, nextCategories] = await Promise.all([
        api.getExpenses(),
        api.getGroups(),
        api.getFriends(),
        api.getCategories(),
      ]);
      setExpenses(nextExpenses);
      setGroups(nextGroups.filter((group) => group.dissolvedAt === null));
      setFriends(nextFriends);
      setCategories(nextCategories);
      setCategoryId((current) =>
        nextCategories.some((category) => category.id === current)
          ? current
          : (nextCategories[0]?.id ?? ''),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải khoản chi.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userLabels = useMemo(() => {
    const labels: Record<string, string> = { [currentUserId]: displayName || 'Bạn' };
    for (const friendship of friends) {
      const id = friendship.friend.id;
      if (id) labels[id] = humanIdentityLabel(friendship.friend);
    }
    for (const member of members) labels[member.userId] = humanIdentityLabel(member.user);
    return labels;
  }, [currentUserId, displayName, friends, members]);

  const activeExpenses = expenses.filter((expense) => expense.state !== 'DELETED');
  const visibleExpenses = showHistory ? expenses : activeExpenses;

  function startCreate(): void {
    setEditing(null);
    setDescription('');
    setAmountInput('');
    setCurrency('VND');
    setCategoryId(categories[0]?.id ?? '');
    setGroupId('');
    setFriendId('');
    setMembers([]);
    setPayerId(currentUserId);
    setParticipants({ [currentUserId]: true });
    setShares({ [currentUserId]: '' });
    setError('');
    setShowForm(true);
  }

  async function selectGroup(nextGroupId: string): Promise<void> {
    setGroupId(nextGroupId);
    setFriendId('');
    setError('');
    if (!nextGroupId) {
      setMembers([]);
      setParticipants({ [currentUserId]: true });
      setShares({ [currentUserId]: amountInput });
      setPayerId(currentUserId);
      return;
    }
    try {
      const nextMembers = await api.getGroupMembers(nextGroupId);
      setMembers(nextMembers);
      const ownerIsMember = nextMembers.some((member) => member.userId === currentUserId);
      const initial = ownerIsMember ? { [currentUserId]: true } : {};
      setParticipants(initial);
      setShares(ownerIsMember ? { [currentUserId]: amountInput } : {});
      setPayerId(ownerIsMember ? currentUserId : (nextMembers[0]?.userId ?? currentUserId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải thành viên nhóm.');
    }
  }

  function selectFriend(nextFriendId: string): void {
    setFriendId(nextFriendId);
    setGroupId('');
    setMembers([]);
    if (!nextFriendId) {
      setParticipants({ [currentUserId]: true });
      setShares({ [currentUserId]: amountInput });
      setPayerId(currentUserId);
      return;
    }
    setParticipants({ [currentUserId]: true, [nextFriendId]: true });
    setShares({ [currentUserId]: '', [nextFriendId]: '' });
    setPayerId(currentUserId);
  }

  function toggleParticipant(userId: string): void {
    if (editing) return;
    const selected = Boolean(participants[userId]);
    setParticipants((current) => {
      const next = { ...current };
      if (selected) delete next[userId];
      else next[userId] = true;
      return next;
    });
    setShares((current) => {
      const next = { ...current };
      if (selected) delete next[userId];
      else next[userId] = '';
      return next;
    });
  }

  async function startEdit(expense: ExpenseDto): Promise<void> {
    setEditing(expense);
    setDescription(expense.description);
    setAmountInput(inputFromMinor(expense.amountMinor, expense.currency));
    setCurrency(expense.currency);
    setCategoryId(expense.categoryId ?? '');
    setGroupId(expense.groupId ?? '');
    setFriendId(expense.friendId ?? '');
    setPayerId(expense.payerId);
    setParticipants(
      Object.fromEntries(expense.participants.map((participant) => [participant.userId, true])),
    );
    setShares(
      Object.fromEntries(
        expense.participants.map((participant) => [
          participant.userId,
          inputFromMinor(participant.shareMinor, expense.currency),
        ]),
      ),
    );
    setError('');
    setShowForm(true);
    if (expense.groupId) {
      try {
        setMembers(await api.getGroupMembers(expense.groupId));
      } catch {
        setMembers([]);
      }
    } else setMembers([]);
  }

  function idempotencyKey(payload: unknown): string {
    const serialized = JSON.stringify(payload);
    if (mutationKey.current?.payload === serialized) return mutationKey.current.key;
    const key = createOfflineOperationId();
    mutationKey.current = { payload: serialized, key };
    return key;
  }

  async function saveExpense(): Promise<void> {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const amountMinor = minorFromInput(amountInput, currency);
      const selectedParticipants = Object.keys(participants).filter((id) => participants[id]);
      if (!description.trim()) throw new Error('Mô tả khoản chi là bắt buộc.');
      if (!selectedParticipants.length) throw new Error('Chọn ít nhất một người tham gia.');
      if (!selectedParticipants.includes(payerId))
        throw new Error('Người trả phải nằm trong danh sách tham gia.');
      const expenseParticipants = selectedParticipants.map((userId) => ({
        userId,
        shareMinor: minorFromInput(shares[userId] ?? '', currency),
      }));
      const sharesTotal = expenseParticipants.reduce(
        (sum, participant) => sum + BigInt(participant.shareMinor),
        0n,
      );
      if (sharesTotal !== BigInt(amountMinor)) throw new Error('Tổng phần chia phải bằng số tiền.');

      const keyPayload = {
        id: editing?.id,
        expectedVersion: editing?.version ?? 0,
        amountMinor,
        currency,
        description: description.trim(),
        payerId: editing?.payerId ?? payerId,
        participants: expenseParticipants,
        ...(categoryId ? { categoryId } : {}),
        groupId: editing?.groupId ?? (groupId || undefined),
        friendId: editing?.friendId ?? (friendId || undefined),
      };
      const key = idempotencyKey(keyPayload);
      if (editing) {
        const update: UpdateExpenseDto = {
          amountMinor,
          currency,
          description: description.trim(),
          participants: expenseParticipants,
          ...(categoryId ? { categoryId } : {}),
          expectedVersion: editing.version,
        };
        await api.updateExpense(editing.id, update, key);
      } else {
        const create: CreateExpenseDto = {
          amountMinor,
          currency,
          description: description.trim(),
          payerId,
          participants: expenseParticipants,
          ...(categoryId ? { categoryId } : {}),
          ...(groupId ? { groupId } : {}),
          ...(friendId ? { friendId } : {}),
        };
        await api.createExpense(create, key);
      }
      mutationKey.current = null;
      setMessage(editing ? 'Đã cập nhật khoản chi.' : 'Đã tạo khoản chi.');
      setShowForm(false);
      setEditing(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu khoản chi.');
    } finally {
      setWorking(false);
    }
  }

  function confirmDelete(expense: ExpenseDto): void {
    Alert.alert(
      'Xóa khoản chi?',
      'Khoản chi sẽ được chuyển vào lịch sử và không còn tính vào tổng đang hoạt động.',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xóa', style: 'destructive', onPress: () => void deleteExpense(expense) },
      ],
    );
  }

  async function deleteExpense(expense: ExpenseDto): Promise<void> {
    const keyId = `${expense.id}:${expense.version}`;
    let key = deleteKeys.current.get(keyId);
    if (!key) {
      key = createOfflineOperationId();
      deleteKeys.current.set(keyId, key);
    }
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await api.deleteExpense(expense.id, expense.version, key);
      deleteKeys.current.delete(keyId);
      setMessage('Đã xóa khoản chi.');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa khoản chi.');
    } finally {
      setWorking(false);
    }
  }

  const selectedFriend = friends.find((friendship) => friendship.friend.id === friendId)?.friend;
  const peopleById = new Map<string, string>();
  if (groupId) {
    for (const member of members) peopleById.set(member.userId, humanIdentityLabel(member.user));
    for (const participant of editing?.participants ?? [])
      if (!peopleById.has(participant.userId))
        peopleById.set(participant.userId, userLabels[participant.userId] ?? 'Người dùng Equa');
  } else if (friendId) {
    peopleById.set(currentUserId, displayName || 'Bạn');
    peopleById.set(friendId, humanIdentityLabel(selectedFriend));
  } else peopleById.set(currentUserId, displayName || 'Bạn');
  const people = [...peopleById].map(([id, label]) => ({ id, label }));

  return (
    <Screen>
      <ScreenTitle eyebrow="KHOẢN CHI" title="Theo dõi chi tiêu chung" />
      <View style={styles.actionRow}>
        <Button
          title={loading ? 'Đang tải…' : 'Làm mới'}
          tone="secondary"
          disabled={loading || working}
          onPress={() => void refresh()}
        />
        <Button title="Thêm khoản chi" disabled={working} onPress={startCreate} />
      </View>
      <Feedback message={message} error={error} />
      {loading ? (
        <LoadingState label="Đang tải khoản chi…" />
      ) : (
        <Card>
          <View style={styles.actionRow}>
            <SectionTitle>
              {showHistory ? 'Lịch sử khoản chi' : `Đang hoạt động (${activeExpenses.length})`}
            </SectionTitle>
            <Button
              title={showHistory ? 'Đang hoạt động' : 'Lịch sử'}
              tone="secondary"
              onPress={() => setShowHistory((current) => !current)}
            />
          </View>
          {visibleExpenses.length ? (
            visibleExpenses.map((expense) => (
              <View key={expense.id} style={styles.expenseRow}>
                <View style={styles.flex}>
                  <Text style={styles.expenseTitle}>{expense.description || 'Khoản chi'}</Text>
                  <MutedText>
                    {formatMinor(expense.amountMinor, expense.currency)} ·{' '}
                    {groups.find((group) => group.id === expense.groupId)?.name ??
                      (expense.friendId ? 'Chi cùng bạn bè' : 'Cá nhân')}
                  </MutedText>
                  <MutedText>
                    Người trả: {userLabels[expense.payerId] ?? 'Người dùng Equa'} ·{' '}
                    {expense.participants
                      .map((participant) => userLabels[participant.userId] ?? 'Người dùng Equa')
                      .join(', ')}
                  </MutedText>
                  <MutedText>
                    {expense.state === 'DELETED'
                      ? 'DELETED'
                      : expense.state === 'UPDATED'
                        ? 'UPDATED'
                        : 'ACTIVE'}{' '}
                    · Phiên bản {expense.version}
                  </MutedText>
                </View>
                {expense.state !== 'DELETED' ? (
                  <View style={styles.actionRow}>
                    <Button
                      title="Sửa"
                      tone="secondary"
                      disabled={working}
                      onPress={() => void startEdit(expense)}
                    />
                    <Button
                      title="Xóa"
                      tone="danger"
                      disabled={working}
                      onPress={() => confirmDelete(expense)}
                    />
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <MutedText>Chưa có khoản chi trong danh sách này.</MutedText>
          )}
        </Card>
      )}

      {showForm ? (
        <Card>
          <SectionTitle>{editing ? 'Sửa khoản chi' : 'Khoản chi mới'}</SectionTitle>
          <Field
            label="Mô tả"
            value={description}
            onChangeText={setDescription}
            placeholder="Ví dụ: Ăn tối"
          />
          <Field
            label={`Số tiền (${currency})`}
            value={amountInput}
            onChangeText={(value) => {
              setAmountInput(value);
              if (!editing && Object.keys(participants).length === 1 && participants[currentUserId])
                setShares({ [currentUserId]: value });
            }}
            placeholder="50000"
            keyboardType="decimal-pad"
          />
          <Text style={styles.label}>Tiền tệ</Text>
          <View style={styles.chips}>
            {SUPPORTED_CURRENCIES.map((item) => (
              <ChoiceChip
                key={item}
                label={item}
                selected={currency === item}
                disabled={Boolean(editing)}
                onPress={() => setCurrency(item)}
              />
            ))}
          </View>
          <Text style={styles.label}>Nhóm</Text>
          <View style={styles.chips}>
            <ChoiceChip
              label="Cá nhân"
              selected={!groupId && !friendId}
              disabled={Boolean(editing)}
              onPress={() => void selectGroup('')}
            />
            {groups.map((group) => (
              <ChoiceChip
                key={group.id}
                label={group.name}
                selected={groupId === group.id}
                disabled={Boolean(editing)}
                onPress={() => void selectGroup(group.id)}
              />
            ))}
          </View>
          {!editing && !groupId ? (
            <>
              <Text style={styles.label}>Hoặc chia sẻ với bạn</Text>
              <View style={styles.chips}>
                <ChoiceChip
                  label="Không chọn"
                  selected={!friendId}
                  onPress={() => selectFriend('')}
                />
                {friends.map((friendship) => {
                  const id = friendship.friend.id;
                  return id ? (
                    <ChoiceChip
                      key={id}
                      label={humanIdentityLabel(friendship.friend)}
                      selected={friendId === id}
                      onPress={() => selectFriend(id)}
                    />
                  ) : null;
                })}
              </View>
            </>
          ) : null}
          {editing ? (
            <MutedText>Nhóm, người trả và bạn liên kết được giữ nguyên khi sửa.</MutedText>
          ) : null}
          <Text style={styles.label}>Người trả</Text>
          <View style={styles.chips}>
            {people.map((person) => (
              <ChoiceChip
                key={person.id}
                label={person.label}
                selected={payerId === person.id}
                disabled={Boolean(editing)}
                onPress={() => setPayerId(person.id)}
              />
            ))}
          </View>
          <Text style={styles.label}>Người tham gia và phần chia ({currency})</Text>
          {people.map((person) => (
            <View key={person.id} style={styles.shareRow}>
              <ChoiceChip
                label={participants[person.id] ? `✓ ${person.label}` : `□ ${person.label}`}
                selected={Boolean(participants[person.id])}
                disabled={Boolean(editing)}
                onPress={() => toggleParticipant(person.id)}
              />
              {participants[person.id] ? (
                <View style={styles.shareInput}>
                  <Field
                    label="Phần chia"
                    value={shares[person.id] ?? ''}
                    onChangeText={(value) =>
                      setShares((current) => ({ ...current, [person.id]: value }))
                    }
                    placeholder="0"
                    keyboardType="decimal-pad"
                  />
                </View>
              ) : null}
            </View>
          ))}
          <Text style={styles.label}>Danh mục</Text>
          <View style={styles.chips}>
            {categories.map((category) => (
              <ChoiceChip
                key={category.id}
                label={category.name}
                selected={categoryId === category.id}
                onPress={() => setCategoryId(category.id)}
              />
            ))}
          </View>
          <MutedText>Nhập từng phần chia; Ledger kiểm tra tổng và phiên bản khi lưu.</MutedText>
          <View style={styles.actionRow}>
            <Button
              title={working ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo khoản chi'}
              disabled={working}
              onPress={() => void saveExpense()}
            />
            <Button
              title="Hủy"
              tone="secondary"
              disabled={working}
              onPress={() => setShowForm(false)}
            />
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={styles.actionRow}>
          <SectionTitle>Dữ liệu ngoại tuyến</SectionTitle>
          <Button
            title={showOffline ? 'Ẩn' : 'Mở'}
            tone="secondary"
            onPress={() => setShowOffline((current) => !current)}
          />
        </View>
        <MutedText>
          Nhóm và khoản chi đã lưu trên thiết bị; tạo/sửa ngoại tuyến sẽ vào hàng đợi đồng bộ.
        </MutedText>
        {showOffline ? (
          <OfflineDataPanel
            ownerId={currentUserId}
            apiBaseUrl={apiBaseUrl}
            store={store}
            sync={sync}
            accessToken={accessToken}
            userLabels={userLabels}
          />
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  label: { color: mobileColors.muted, fontSize: 12, fontWeight: '700' },
  expenseRow: { gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0EAE4' },
  expenseTitle: { color: mobileColors.ink, fontSize: 14, fontWeight: '800' },
  flex: { flex: 1, gap: 3 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareInput: { flex: 1 },
});
