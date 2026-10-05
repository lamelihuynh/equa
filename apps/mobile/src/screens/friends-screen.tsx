import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type {
  FriendBalanceDto,
  FriendRequestDto,
  FriendshipDto,
  MobileApiClient,
} from '../api/mobile-api';
import { humanIdentityLabel } from '../identity-label';
import { formatMinor } from '../money';
import {
  Button,
  Card,
  Field,
  Feedback,
  LoadingState,
  MutedText,
  Screen,
  ScreenTitle,
  SectionTitle,
} from './screen-primitives';
import { mobileColors } from './screen-primitives';

interface FriendsScreenProps {
  api: MobileApiClient;
  currentUserId: string;
}

export function FriendsScreen({ api, currentUserId }: FriendsScreenProps) {
  const [friends, setFriends] = useState<FriendshipDto[]>([]);
  const [requests, setRequests] = useState<FriendRequestDto[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [balances, setBalances] = useState<Record<string, FriendBalanceDto>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const [nextFriends, nextRequests] = await Promise.all([
        api.getFriends(),
        api.getFriendRequests(),
      ]);
      setFriends(nextFriends);
      setRequests(nextRequests);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải danh sách bạn bè.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const incoming = useMemo(
    () =>
      requests.filter(
        (request) => request.status === 'pending' && request.requesterId !== currentUserId,
      ),
    [currentUserId, requests],
  );
  const outgoing = useMemo(
    () =>
      requests.filter(
        (request) => request.status === 'pending' && request.requesterId === currentUserId,
      ),
    [currentUserId, requests],
  );

  async function send(): Promise<void> {
    const value = identifier.trim();
    if (!value) return;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await api.sendFriendRequest(value);
      setIdentifier('');
      setMessage('Đã gửi lời mời kết bạn.');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể gửi lời mời.');
    } finally {
      setWorking(false);
    }
  }

  async function respond(id: string, accept: boolean): Promise<void> {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      if (accept) await api.acceptFriendRequest(id);
      else await api.rejectFriendRequest(id);
      setMessage(accept ? 'Đã chấp nhận lời mời.' : 'Đã từ chối lời mời.');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật lời mời.');
    } finally {
      setWorking(false);
    }
  }

  function askRemove(friendId: string, label: string): void {
    Alert.alert('Xóa bạn?', `Xóa ${label} khỏi danh sách bạn bè?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa bạn', style: 'destructive', onPress: () => void remove(friendId) },
    ]);
  }

  async function remove(friendId: string): Promise<void> {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await api.removeFriend(friendId);
      setMessage('Đã xóa bạn bè.');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa bạn bè.');
    } finally {
      setWorking(false);
    }
  }

  async function loadBalance(friendId: string): Promise<void> {
    setError('');
    try {
      const balance = await api.getFriendBalance(friendId);
      setBalances((current) => ({ ...current, [friendId]: balance }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải số dư.');
    }
  }

  return (
    <Screen>
      <ScreenTitle eyebrow="BẠN BÈ" title="Chia sẻ cùng người quen" />
      <Button
        title={loading ? 'Đang tải…' : 'Làm mới'}
        disabled={loading || working}
        tone="secondary"
        onPress={() => void refresh()}
      />
      <Feedback message={message} error={error} />
      <Card>
        <SectionTitle>Gửi lời mời</SectionTitle>
        <Field
          label="Email hoặc username"
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="ban@example.com"
        />
        <Button
          title={working ? 'Đang gửi…' : 'Gửi lời mời'}
          disabled={working || !identifier.trim()}
          onPress={() => void send()}
        />
      </Card>
      {loading ? (
        <LoadingState label="Đang tải bạn bè…" />
      ) : (
        <>
          <Card>
            <SectionTitle>Lời mời nhận được ({incoming.length})</SectionTitle>
            {incoming.length ? (
              incoming.map((request) => (
                <View key={request.id} style={styles.row}>
                  <View style={styles.copy}>
                    <Text style={styles.primaryText}>{humanIdentityLabel(request.requester)}</Text>
                    {request.targetEmail ? <MutedText>{request.targetEmail}</MutedText> : null}
                  </View>
                  <Button
                    title="Chấp nhận"
                    disabled={working}
                    onPress={() => void respond(request.id, true)}
                  />
                  <Button
                    title="Từ chối"
                    tone="secondary"
                    disabled={working}
                    onPress={() => void respond(request.id, false)}
                  />
                </View>
              ))
            ) : (
              <MutedText>Không có lời mời đang chờ.</MutedText>
            )}
          </Card>
          <Card>
            <SectionTitle>Lời mời đã gửi ({outgoing.length})</SectionTitle>
            {outgoing.length ? (
              outgoing.map((request) => (
                <Text key={request.id} style={styles.primaryText}>
                  {humanIdentityLabel(request.target ?? { email: request.targetEmail })} · Đang chờ
                </Text>
              ))
            ) : (
              <MutedText>Chưa có lời mời gửi đi.</MutedText>
            )}
          </Card>
          <Card>
            <SectionTitle>Bạn bè ({friends.length})</SectionTitle>
            {friends.length ? (
              friends.map((friendship) => {
                const friendId =
                  friendship.friend.id ??
                  (friendship.userA === currentUserId ? friendship.userB : friendship.userA);
                const label = humanIdentityLabel(friendship.friend);
                const balance = balances[friendId];
                return (
                  <View key={`${friendship.userA}:${friendship.userB}`} style={styles.friendRow}>
                    <View style={styles.copy}>
                      <Text style={styles.primaryText}>{label}</Text>
                      {friendship.friend.email ? (
                        <MutedText>{friendship.friend.email}</MutedText>
                      ) : null}
                      {balance ? <MutedText>{formatBalance(balance)}</MutedText> : null}
                    </View>
                    <Button
                      title={balance ? 'Đã xem số dư' : 'Số dư'}
                      tone="secondary"
                      disabled={Boolean(balance)}
                      onPress={() => void loadBalance(friendId)}
                    />
                    <Button
                      title="Xóa"
                      tone="danger"
                      disabled={working}
                      onPress={() => askRemove(friendId, label)}
                    />
                  </View>
                );
              })
            ) : (
              <MutedText>Hãy gửi hoặc chấp nhận lời mời để bắt đầu.</MutedText>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0EAE4' },
  friendRow: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0EAE4' },
  copy: { flex: 1, gap: 3 },
  primaryText: { color: mobileColors.ink, fontSize: 14, fontWeight: '700' },
});

function formatBalance(balance: FriendBalanceDto): string {
  const currencies = balance.balances ?? [];
  if (!currencies.length)
    return balance.hasOutstandingDebt ? 'Còn số dư chưa tất toán' : 'Đã cân bằng';
  return currencies
    .map((item) => {
      const amount = BigInt(item.netMinor);
      if (amount === 0n) return `Đã cân bằng · ${item.currency}`;
      const direction = amount > 0n ? 'Họ nợ bạn' : 'Bạn nợ họ';
      return `${direction} ${formatMinor((amount > 0n ? amount : -amount).toString(), item.currency)}`;
    })
    .join(' · ');
}
