import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import type { ExpenseDto, ExpenseTotalDto, GroupDto, MobileApiClient } from '../api/mobile-api';
import { formatMinor } from '../money';
import {
  Button,
  Card,
  LoadingState,
  MutedText,
  Screen,
  ScreenTitle,
  SectionTitle,
} from './screen-primitives';
import { mobileColors } from './screen-primitives';

interface HomeScreenProps {
  api: MobileApiClient;
  displayName: string;
}

export function HomeScreen({ api, displayName }: HomeScreenProps) {
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDto[]>([]);
  const [totals, setTotals] = useState<ExpenseTotalDto['totals']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const [nextGroups, nextExpenses, expenseTotal] = await Promise.all([
        api.getGroups(),
        api.getExpenses(),
        api.getExpenseTotals(),
      ]);
      setGroups(nextGroups.filter((group) => group.dissolvedAt === null));
      setExpenses(nextExpenses.filter((expense) => expense.state !== 'DELETED'));
      setTotals(expenseTotal.totals);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải tổng quan.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const recent = [...expenses]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 4);

  return (
    <Screen>
      <ScreenTitle eyebrow="EQUA · TỔNG QUAN" title={`Xin chào, ${displayName}`} />
      <Button
        title={loading ? 'Đang làm mới…' : 'Làm mới'}
        disabled={loading}
        onPress={() => void refresh()}
        tone="secondary"
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: mobileColors.danger }}>
          {error}
        </Text>
      ) : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <Card>
            <SectionTitle>Không gian của bạn</SectionTitle>
            <MutedText>
              {groups.length} nhóm đang hoạt động · {expenses.length} khoản chi đang hoạt động
            </MutedText>
          </Card>
          <Card>
            <SectionTitle>Tổng khoản chi theo tiền tệ</SectionTitle>
            {totals.length ? (
              totals.map((total) => (
                <View
                  key={total.currency}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                >
                  <Text style={{ color: mobileColors.muted }}>
                    {total.count} khoản · {total.currency}
                  </Text>
                  <Text style={{ color: mobileColors.ink, fontWeight: '800' }}>
                    {formatMinor(total.totalMinor, total.currency)}
                  </Text>
                </View>
              ))
            ) : (
              <MutedText>Chưa có khoản chi đang hoạt động.</MutedText>
            )}
          </Card>
          <Card>
            <SectionTitle>Gần đây</SectionTitle>
            {recent.length ? (
              recent.map((expense) => (
                <View
                  key={expense.id}
                  style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F0EAE4' }}
                >
                  <Text style={{ color: mobileColors.ink, fontWeight: '700' }}>
                    {expense.description || 'Khoản chi'}
                  </Text>
                  <MutedText>
                    {formatMinor(expense.amountMinor, expense.currency)} ·{' '}
                    {expense.participants.length} người
                  </MutedText>
                </View>
              ))
            ) : (
              <MutedText>Khoản chi mới sẽ xuất hiện ở đây.</MutedText>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
