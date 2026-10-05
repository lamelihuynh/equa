import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';

export const mobileColors = {
  ink: '#241917',
  muted: '#71645B',
  coral: '#E86A4C',
  green: '#287A62',
  border: '#DDC9B6',
  paper: '#FAF6F0',
  card: '#FFFDFB',
  danger: '#A23D31',
};

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function ScreenTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  disabled = false,
  tone = 'primary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'primary' ? styles.primary : tone === 'danger' ? styles.danger : styles.secondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={tone === 'secondary' ? styles.secondaryText : styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline = false,
  editable = true,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  editable?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        editable={editable}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A7C70"
        style={[styles.input, multiline && styles.multiline, !editable && styles.readOnly]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

export function ChoiceChip({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.disabled]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function Feedback({ message, error }: { message?: string; error?: string }) {
  if (error)
    return (
      <Text accessibilityRole="alert" style={styles.error}>
        {error}
      </Text>
    );
  if (message)
    return (
      <Text accessibilityLiveRegion="polite" style={styles.notice}>
        {message}
      </Text>
    );
  return null;
}

export function LoadingState({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={mobileColors.coral} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function MutedText({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: mobileColors.paper },
  content: { padding: 18, paddingBottom: 40, gap: 14 },
  titleBlock: { gap: 5, marginBottom: 2 },
  eyebrow: { color: mobileColors.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: mobileColors.ink, fontSize: 28, fontWeight: '800' },
  card: {
    padding: 15,
    gap: 10,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 16,
    backgroundColor: mobileColors.card,
  },
  sectionTitle: { color: mobileColors.ink, fontSize: 16, fontWeight: '800' },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primary: { backgroundColor: mobileColors.coral },
  secondary: { borderWidth: 1, borderColor: mobileColors.border, backgroundColor: '#FFFFFF' },
  danger: { backgroundColor: mobileColors.danger },
  buttonText: { color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
  secondaryText: { color: mobileColors.ink, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
  fieldBlock: { gap: 5 },
  label: { color: mobileColors.muted, fontSize: 12, fontWeight: '700' },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    color: mobileColors.ink,
    fontSize: 15,
  },
  multiline: { minHeight: 82, paddingTop: 11 },
  readOnly: { backgroundColor: '#F1ECE7', color: mobileColors.muted },
  chip: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  chipSelected: { borderColor: mobileColors.green, backgroundColor: '#E4F1EB' },
  chipText: { color: mobileColors.ink, fontSize: 12, fontWeight: '700' },
  chipTextSelected: { color: mobileColors.green },
  error: { color: mobileColors.danger, fontSize: 13, lineHeight: 19 },
  notice: { color: mobileColors.green, fontSize: 13, lineHeight: 19 },
  muted: { color: mobileColors.muted, fontSize: 13, lineHeight: 19 },
  loading: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
