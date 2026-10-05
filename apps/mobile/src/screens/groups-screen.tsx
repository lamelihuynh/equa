import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type {
  GroupDto,
  GroupInvitationDto,
  GroupMemberDto,
  GroupType,
  MobileApiClient,
} from '../api/mobile-api';
import { humanIdentityLabel } from '../identity-label';
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

const groupTypes: Array<{ value: GroupType; label: string }> = [
  { value: 'trip', label: 'Chuyến đi' },
  { value: 'household', label: 'Nhà ở chung' },
  { value: 'event', label: 'Sự kiện' },
  { value: 'other', label: 'Khác' },
];

interface GroupsScreenProps {
  api: MobileApiClient;
  currentUserId: string;
}

export function GroupsScreen({ api, currentUserId }: GroupsScreenProps) {
  const [groups, setGroups] = useState<GroupDto[]>([]);
  const [invitations, setInvitations] = useState<GroupInvitationDto[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupDto | null>(null);
  const [members, setMembers] = useState<GroupMemberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<GroupType>('trip');
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<GroupType>('trip');
  const [inviteEmail, setInviteEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const [nextGroups, nextInvitations] = await Promise.all([
        api.getGroups(),
        api.getGroupInvitations(),
      ]);
      setGroups(nextGroups.filter((group) => group.dissolvedAt === null));
      setInvitations(nextInvitations);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải nhóm.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function openGroup(group: GroupDto): Promise<void> {
    setLoading(true);
    setError('');
    setMessage('');
    setShowEdit(false);
    try {
      const [details, nextMembers] = await Promise.all([
        api.getGroup(group.id),
        api.getGroupMembers(group.id),
      ]);
      setSelectedGroup(details);
      setMembers(nextMembers);
      setEditName(details.name);
      setEditType(details.type);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể mở nhóm.');
    } finally {
      setLoading(false);
    }
  }

  async function createGroup(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const created = await api.createGroup({ name: trimmed, type });
      setName('');
      setShowCreate(false);
      setMessage('Đã tạo nhóm. Bạn là Admin.');
      await refresh();
      await openGroup(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo nhóm.');
    } finally {
      setWorking(false);
    }
  }

  async function updateGroup(): Promise<void> {
    if (!selectedGroup || !editName.trim()) return;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const updated = await api.updateGroup(selectedGroup.id, {
        name: editName.trim(),
        type: editType,
      });
      setSelectedGroup(updated);
      setShowEdit(false);
      setMessage('Đã lưu thay đổi nhóm.');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể sửa nhóm.');
    } finally {
      setWorking(false);
    }
  }

  async function inviteMember(): Promise<void> {
    if (!selectedGroup || !inviteEmail.trim()) return;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      await api.inviteToGroup(selectedGroup.id, inviteEmail.trim());
      setMessage(`Đã gửi lời mời tới ${inviteEmail.trim()}.`);
      setInviteEmail('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể gửi lời mời.');
    } finally {
      setWorking(false);
    }
  }

  async function respondToInvitation(id: string, accept: boolean): Promise<void> {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      if (accept) await api.acceptGroupInvitation(id);
      else await api.declineGroupInvitation(id);
      setMessage(accept ? 'Đã tham gia nhóm.' : 'Đã từ chối lời mời.');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật lời mời.');
    } finally {
      setWorking(false);
    }
  }

  function askRemoveMember(member: GroupMemberDto): void {
    const label = humanIdentityLabel(member.user);
    Alert.alert('Xóa thành viên?', `Xóa ${label} khỏi nhóm?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => void removeMember(member.userId),
      },
    ]);
  }

  async function removeMember(userId: string): Promise<void> {
    if (!selectedGroup) return;
    setWorking(true);
    setError('');
    try {
      await api.removeGroupMember(selectedGroup.id, userId);
      setMessage('Đã xóa thành viên khỏi nhóm.');
      await openGroup(selectedGroup);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa thành viên.');
    } finally {
      setWorking(false);
    }
  }

  function askDissolve(): void {
    if (!selectedGroup) return;
    Alert.alert('Giải tán nhóm?', 'Thao tác này không thể hoàn tác.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Giải tán', style: 'destructive', onPress: () => void dissolveGroup() },
    ]);
  }

  async function dissolveGroup(): Promise<void> {
    if (!selectedGroup) return;
    setWorking(true);
    setError('');
    try {
      await api.dissolveGroup(selectedGroup.id);
      setSelectedGroup(null);
      setMembers([]);
      setMessage('Đã giải tán nhóm.');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể giải tán nhóm.');
    } finally {
      setWorking(false);
    }
  }

  const isAdmin = members.some(
    (member) => member.userId === currentUserId && member.role === 'admin',
  );

  return (
    <Screen>
      <ScreenTitle eyebrow="NHÓM" title={selectedGroup?.name ?? 'Không gian chung'} />
      <View style={styles.actions}>
        {selectedGroup ? (
          <Button title="← Tất cả nhóm" tone="secondary" onPress={() => setSelectedGroup(null)} />
        ) : (
          <Button
            title={loading ? 'Đang tải…' : 'Làm mới'}
            disabled={loading}
            tone="secondary"
            onPress={() => void refresh()}
          />
        )}
        {!selectedGroup ? (
          <Button title="Tạo nhóm" onPress={() => setShowCreate((current) => !current)} />
        ) : null}
      </View>
      <Feedback message={message} error={error} />
      {showCreate && !selectedGroup ? (
        <Card>
          <SectionTitle>Tạo nhóm mới</SectionTitle>
          <Field
            label="Tên nhóm"
            value={name}
            onChangeText={setName}
            placeholder="Ví dụ: Chuyến đi Đà Lạt"
          />
          <Text style={styles.label}>Loại nhóm</Text>
          <View style={styles.chips}>
            {groupTypes.map((item) => (
              <ChoiceChip
                key={item.value}
                label={item.label}
                selected={type === item.value}
                onPress={() => setType(item.value)}
              />
            ))}
          </View>
          <Button
            title={working ? 'Đang tạo…' : 'Tạo nhóm'}
            disabled={working || !name.trim()}
            onPress={() => void createGroup()}
          />
        </Card>
      ) : null}

      {loading ? (
        <LoadingState label="Đang tải nhóm…" />
      ) : selectedGroup ? (
        <>
          <Card>
            <View style={styles.row}>
              <SectionTitle>Quản lý nhóm</SectionTitle>
              <Text style={styles.role}>{isAdmin ? 'ADMIN' : 'MEMBER'}</Text>
            </View>
            <MutedText>
              Loại: {groupTypes.find((item) => item.value === selectedGroup.type)?.label ?? 'Khác'}
            </MutedText>
            {isAdmin ? (
              <Button
                title={showEdit ? 'Đóng sửa nhóm' : 'Sửa nhóm'}
                tone="secondary"
                onPress={() => setShowEdit((current) => !current)}
              />
            ) : null}
            {showEdit && isAdmin ? (
              <View style={styles.form}>
                <Field label="Tên nhóm" value={editName} onChangeText={setEditName} />
                <Text style={styles.label}>Loại nhóm</Text>
                <View style={styles.chips}>
                  {groupTypes.map((item) => (
                    <ChoiceChip
                      key={item.value}
                      label={item.label}
                      selected={editType === item.value}
                      onPress={() => setEditType(item.value)}
                    />
                  ))}
                </View>
                <Button
                  title="Lưu thay đổi"
                  disabled={working || !editName.trim()}
                  onPress={() => void updateGroup()}
                />
              </View>
            ) : null}
            {isAdmin ? (
              <>
                <SectionTitle>Mời thành viên</SectionTitle>
                <Field
                  label="Email người đã đăng ký"
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="ban@example.com"
                />
                <Button
                  title="Gửi lời mời trong ứng dụng"
                  disabled={working || !inviteEmail.trim()}
                  onPress={() => void inviteMember()}
                />
              </>
            ) : null}
          </Card>
          <Card>
            <SectionTitle>Thành viên ({members.length})</SectionTitle>
            {members.length ? (
              members.map((member) => (
                <View key={member.userId} style={styles.memberRow}>
                  <View style={styles.copy}>
                    <Text style={styles.memberName}>{humanIdentityLabel(member.user)}</Text>
                    {member.user?.email ? <MutedText>{member.user.email}</MutedText> : null}
                  </View>
                  <Text style={styles.role}>{member.role.toUpperCase()}</Text>
                  {isAdmin && member.userId !== currentUserId ? (
                    <Button
                      title="Xóa"
                      tone="danger"
                      disabled={working}
                      onPress={() => askRemoveMember(member)}
                    />
                  ) : null}
                </View>
              ))
            ) : (
              <MutedText>Chưa tải được danh sách thành viên.</MutedText>
            )}
            {isAdmin ? (
              <Button
                title="Giải tán nhóm"
                tone="danger"
                disabled={working}
                onPress={askDissolve}
              />
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <SectionTitle>Lời mời đang chờ ({invitations.length})</SectionTitle>
            {invitations.length ? (
              invitations.map((invitation) => (
                <View key={invitation.id} style={styles.invitation}>
                  <View style={styles.copy}>
                    <Text style={styles.memberName}>{invitation.group.name}</Text>
                    <MutedText>
                      Mời bởi {humanIdentityLabel(invitation.inviter)} ·{' '}
                      {new Date(invitation.createdAt).toLocaleDateString('vi-VN')}
                    </MutedText>
                    <MutedText>
                      Loại:{' '}
                      {groupTypes.find((item) => item.value === invitation.group.type)?.label ??
                        'Khác'}
                    </MutedText>
                  </View>
                  <View style={styles.actions}>
                    <Button
                      title="Chấp nhận"
                      disabled={working}
                      onPress={() => void respondToInvitation(invitation.id, true)}
                    />
                    <Button
                      title="Từ chối"
                      tone="secondary"
                      disabled={working}
                      onPress={() => void respondToInvitation(invitation.id, false)}
                    />
                  </View>
                </View>
              ))
            ) : (
              <MutedText>Không có lời mời đang chờ.</MutedText>
            )}
          </Card>
          <Card>
            <SectionTitle>Nhóm của bạn ({groups.length})</SectionTitle>
            {groups.length ? (
              groups.map((group) => (
                <View key={group.id} style={styles.groupRow}>
                  <View style={styles.copy}>
                    <Text style={styles.memberName}>{group.name}</Text>
                    <MutedText>
                      {groupTypes.find((item) => item.value === group.type)?.label ?? 'Khác'}
                    </MutedText>
                  </View>
                  <Button title="Mở" tone="secondary" onPress={() => void openGroup(group)} />
                </View>
              ))
            ) : (
              <MutedText>Chưa có nhóm. Tạo nhóm hoặc chấp nhận lời mời để bắt đầu.</MutedText>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  form: { gap: 10, paddingTop: 8 },
  label: { color: mobileColors.muted, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  role: { color: mobileColors.green, fontSize: 11, fontWeight: '900' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: '#F0EAE4',
  },
  copy: { flex: 1, gap: 3 },
  memberName: { color: mobileColors.ink, fontSize: 14, fontWeight: '700' },
  invitation: { gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0EAE4' },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0EAE4',
  },
});
