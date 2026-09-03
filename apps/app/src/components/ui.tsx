import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, HIT_SIZE, radius, spacing, type } from '../lib/theme';

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <View style={[{ padding: spacing.lg, gap: spacing.lg, flexGrow: 1 }, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={[type.title, { color: colors.text }]}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={[type.heading, { color: colors.text }]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  return (
    <Text style={[type.body, { color: muted ? colors.textMuted : colors.text, lineHeight: 23 }, style]}>
      {children}
    </Text>
  );
}

export function Caption({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.caption, { color: colors.textMuted }, style]}>{children}</Text>;
}

export function Label({
  children,
  numberOfLines,
}: {
  children: ReactNode;
  /** Set to 1 where labels head the columns of a row and must not wrap out of line. */
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[type.label, { color: colors.textFaint, textTransform: 'uppercase' }]}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: colors.accent },
        variant === 'secondary' && { backgroundColor: colors.surfaceRaised },
        variant === 'ghost' && { backgroundColor: 'transparent' },
        variant === 'danger' && { backgroundColor: 'transparent' },
        pressed && { opacity: 0.7 },
        inactive && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.accentText : colors.text} />
      ) : (
        <Text
          style={[
            type.body,
            styles.buttonLabel,
            variant === 'primary' && { color: colors.accentText },
            variant === 'danger' && { color: colors.danger },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** A short, non-technical explanation of something that went wrong. */
export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.errorNote}>
      <Text style={[type.body, { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} size="large" />
      {label ? <Caption>{label}</Caption> : null}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.loading}>
      <Heading>{title}</Heading>
      <Caption style={{ textAlign: 'center', maxWidth: 300 }}>{body}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  button: {
    minHeight: HIT_SIZE,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonLabel: { fontWeight: '600', color: colors.text },
  errorNote: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
});
