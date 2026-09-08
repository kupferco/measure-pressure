import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Caption, Label } from './ui';
import { colors, radius, spacing, type } from '../lib/theme';

/**
 * Saying exactly when a reading was taken.
 *
 * The four presets on the confirm screen cover almost everything; this is for the
 * reading written on a scrap of paper on Sunday and typed in on Tuesday.
 *
 * Presentation differs by platform on purpose. On iOS this is a real form sheet -
 * React Native's Modal with `presentationStyle="formSheet"` is UIKit's own, so it
 * gets the system's sizing, the drag-to-dismiss and the card behind it. The web has
 * no such thing, so it falls back to a dimmed backdrop with a centred card, which
 * is what a browser modal has always been. Android ignores `presentationStyle` and
 * slides a full-screen modal up, which is that platform's own convention.
 *
 * No date-picker dependency. A stepper for the day and two fields for the time is
 * less code than a library, works identically everywhere, and is fully legible on
 * a small screen - which the wheel pickers are not.
 */
export function WhenSheet({
  visible,
  value,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  /** What the screen currently has, so the sheet opens where the user left off. */
  value: Date;
  onCancel: () => void;
  onConfirm: (measuredAt: Date) => void;
}) {
  const isWeb = Platform.OS === 'web';

  const [day, setDay] = useState(() => startOfDay(value));
  const [hours, setHours] = useState(() => pad(value.getHours()));
  const [minutes, setMinutes] = useState(() => pad(value.getMinutes()));

  // Opening is the only time the draft should jump; editing it must not be undone
  // by a re-render of the screen underneath.
  useEffect(() => {
    if (!visible) return;
    setDay(startOfDay(value));
    setHours(pad(value.getHours()));
    setMinutes(pad(value.getMinutes()));
  }, [visible, value]);

  const composed = useMemo(() => {
    const h = Number.parseInt(hours, 10);
    const m = Number.parseInt(minutes, 10);
    if (!isValidHour(h) || !isValidMinute(m)) return null;
    const next = new Date(day);
    next.setHours(h, m, 0, 0);
    return next;
  }, [day, hours, minutes]);

  const inFuture = composed !== null && composed.getTime() > Date.now();
  const problem = composed === null ? 'Enter a time as hours and minutes.' : inFuture ? 'That is still in the future.' : null;

  const body = (
    <View style={[styles.body, isWeb && styles.bodyWeb]}>
      <Text style={styles.title}>When was this taken?</Text>

      <View style={{ gap: spacing.sm }}>
        <Label>Day</Label>
        <View style={styles.stepper}>
          <StepButton icon="chevron-back" label="Previous day" onPress={() => setDay(addDays(day, -1))} />
          <Text style={styles.stepperValue}>{describeDay(day)}</Text>
          {/* Tomorrow is never a reading you have already taken. */}
          <StepButton
            icon="chevron-forward"
            label="Next day"
            disabled={isToday(day)}
            onPress={() => setDay(addDays(day, 1))}
          />
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Label>Time</Label>
        <View style={styles.timeRow}>
          <TimeField value={hours} onChange={setHours} max={23} label="Hours" />
          <Text style={styles.colon}>:</Text>
          <TimeField value={minutes} onChange={setMinutes} max={59} label="Minutes" />
          <Pressable
            onPress={() => {
              const now = new Date();
              setDay(startOfDay(now));
              setHours(pad(now.getHours()));
              setMinutes(pad(now.getMinutes()));
            }}
            accessibilityRole="button"
            hitSlop={8}
            style={{ marginLeft: spacing.sm }}
          >
            <Text style={[type.caption, { color: colors.accent }]}>Now</Text>
          </Pressable>
        </View>
        <Caption>24-hour clock.</Caption>
      </View>

      {problem ? <Caption>{problem}</Caption> : null}

      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Button
          label="Use this time"
          onPress={() => composed && onConfirm(composed)}
          disabled={problem !== null}
        />
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      onRequestClose={onCancel}
      animationType={isWeb ? 'fade' : 'slide'}
      transparent={isWeb}
      // Ignored when transparent, which is why it is only set off the web.
      presentationStyle={isWeb ? undefined : 'formSheet'}
    >
      {isWeb ? (
        // Tapping the dimmed area closes, the way every other dialog on the web does.
        <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Close">
          {/* Swallows the press so a tap inside the card does not close it. */}
          <Pressable onPress={() => {}} style={styles.card}>
            {body}
          </Pressable>
        </Pressable>
      ) : (
        <View style={styles.sheet}>{body}</View>
      )}
    </Modal>
  );
}

function StepButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.step, pressed && { opacity: 0.7 }, disabled && { opacity: 0.3 }]}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

function TimeField({
  value,
  onChange,
  max,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  max: number;
  label: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(text) => onChange(text.replace(/[^0-9]/g, '').slice(0, 2))}
      // Padding a single digit on blur means "7" becomes 07 rather than staying
      // ambiguous next to a colon.
      onBlur={() => {
        const n = Number.parseInt(value, 10);
        onChange(Number.isFinite(n) ? pad(Math.min(Math.max(n, 0), max)) : '00');
      }}
      keyboardType="number-pad"
      selectTextOnFocus
      accessibilityLabel={label}
      style={styles.timeInput}
    />
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const isValidHour = (n: number) => Number.isInteger(n) && n >= 0 && n <= 23;
const isValidMinute = (n: number) => Number.isInteger(n) && n >= 0 && n <= 59;

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

const isToday = (day: Date) => startOfDay(day).getTime() === startOfDay(new Date()).getTime();

/** "Today" and "Yesterday" are how people say it; anything older gets a date. */
export function describeDay(day: Date): string {
  const days = Math.round((startOfDay(day).getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === -1) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  body: { padding: spacing.lg, gap: spacing.lg },
  bodyWeb: { gap: spacing.md },
  title: { ...type.title, color: colors.text },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
  },
  stepperValue: { ...type.heading, color: colors.text },
  step: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timeInput: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    width: 78,
    textAlign: 'center',
  },
  colon: { fontSize: 32, fontWeight: '700', color: colors.textFaint },
});
