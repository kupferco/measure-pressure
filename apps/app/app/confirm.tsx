import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Posture, ScanResult, Tag } from '@mp/shared';
import {
  classify,
  BP_CATEGORY_LABEL,
  POSTURE_CHOICES,
  POSTURE_LABEL,
  validateReading,
} from '@mp/shared';
import { Body, Button, Caption, Card, ErrorNote, Label, Loading, Screen } from '../src/components/ui';
import { WhenSheet, describeDay } from '../src/components/WhenSheet';
import { api } from '../src/lib/api';
import { categoryColors, colors, radius, spacing, type } from '../src/lib/theme';

/**
 * Confirm and save.
 *
 * Reached two ways: after a photo (numbers arrive pre-filled from the scan) or
 * directly (an empty form for typing a reading in). Both end at the same place, and
 * in both the numbers are editable - the OCR proposes, the person decides.
 */
export default function ConfirmScreen() {
  const router = useRouter();
  const { uri } = useLocalSearchParams<{ uri?: string }>();

  const [scanning, setScanning] = useState(Boolean(uri));
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [posture, setPosture] = useState<Posture | null>(null);
  const [note, setNote] = useState('');
  const [noteFocused, setNoteFocused] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showContext, setShowContext] = useState(false);
  const [minutesAgo, setMinutesAgo] = useState(0);
  // Set only by the custom sheet. While it is null the presets above decide the
  // time, so choosing a preset is simply clearing this back to null.
  const [customAt, setCustomAt] = useState<Date | null>(null);
  const [whenOpen, setWhenOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTags()
      .then(({ tags }) => setTags(tags))
      .catch(() => setTags([]));
  }, []);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    api
      .scan(uri)
      .then((result) => {
        if (cancelled) return;
        setScan(result);
        if (result.systolic !== null) setSystolic(String(result.systolic));
        if (result.diastolic !== null) setDiastolic(String(result.diastolic));
        if (result.pulse !== null) setPulse(String(result.pulse));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'The photo could not be read. Type the numbers in.');
      })
      .finally(() => {
        if (!cancelled) setScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const parsed = {
    systolic: Number.parseInt(systolic, 10),
    diastolic: Number.parseInt(diastolic, 10),
    pulse: pulse ? Number.parseInt(pulse, 10) : null,
  };
  const complete = Number.isFinite(parsed.systolic) && Number.isFinite(parsed.diastolic);
  const problems = complete ? validateReading(parsed) : [];
  const category = complete && problems.length === 0 ? classify(parsed.systolic, parsed.diastolic) : null;

  const measuredAt = useMemo(
    () => customAt ?? new Date(Date.now() - minutesAgo * 60_000),
    [customAt, minutesAgo],
  );

  /**
   * Posture is required, and the only field here that cannot be inferred or left
   * out. Blood pressure is meaningfully different lying, sitting and standing, so a
   * reading without it is a number whose meaning is guessed at later. Asking costs
   * one tap; not asking costs the comparison for good.
   */
  const ready = complete && problems.length === 0 && posture !== null;

  const save = async () => {
    if (!ready || posture === null) return;
    setSaving(true);
    setError(null);
    try {
      await api.createReading({
        systolic: parsed.systolic,
        diastolic: parsed.diastolic,
        pulse: parsed.pulse,
        measuredAt: measuredAt.toISOString(),
        note: note.trim() || null,
        tagIds: selectedTags,
        arm: 'unknown',
        posture,
        source: scan ? 'photo' : 'manual',
        scanId: scan?.scanId ?? null,
      });
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that reading.');
      setSaving(false);
    }
  };

  if (scanning) return <Loading label="Reading the display…" />;

  return (
    <Screen>
      {/*
        Warnings sit above the numbers, not below: if the parser is unsure, that has
        to be known before glancing at the values and tapping save.
      */}
      {scan && scan.warnings.length > 0 ? (
        <Card style={{ backgroundColor: 'rgba(251,191,36,0.12)' }}>
          {scan.warnings.map((warning) => (
            <Body key={warning}>{warning}</Body>
          ))}
        </Card>
      ) : null}

      {scan && scan.confidence > 0 && scan.warnings.length === 0 ? (
        <Caption>Read from your photo. Check it matches the display before saving.</Caption>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <View style={styles.numbers}>
          <NumberField label="Systolic" value={systolic} onChange={setSystolic} autoFocus={!scan} />
          <NumberField label="Diastolic" value={diastolic} onChange={setDiastolic} />
          <NumberField label="Pulse" value={pulse} onChange={setPulse} />
        </View>
        {/*
          Said once, under the row, rather than inside the third label - "Pulse
          (optional)" wrapped onto a second line and pushed that one field lower
          than the other two.
        */}
        <Caption>Pulse is optional.</Caption>
      </View>

      {category ? (
        <View style={[styles.category, { borderColor: categoryColors[category] }]}>
          <View style={[styles.dot, { backgroundColor: categoryColors[category] }]} />
          <Body>{BP_CATEGORY_LABEL[category]}</Body>
        </View>
      ) : null}

      {problems.length > 0 ? <ErrorNote message={problems[0]!.message} /> : null}

      <View style={{ gap: spacing.sm }}>
        <Label>Position</Label>
        <View style={styles.chipRow}>
          {POSTURE_CHOICES.map((choice) => (
            <Chip
              key={choice}
              label={POSTURE_LABEL[choice]}
              selected={posture === choice}
              onPress={() => setPosture(choice)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Label>When</Label>
        <View style={styles.chipRow}>
          {[
            { label: 'Just now', minutes: 0 },
            { label: '15 min ago', minutes: 15 },
            { label: '1 hour ago', minutes: 60 },
            { label: 'Yesterday', minutes: 60 * 24 },
          ].map((option) => (
            <Chip
              key={option.label}
              label={option.label}
              selected={customAt === null && minutesAgo === option.minutes}
              onPress={() => {
                setCustomAt(null);
                setMinutesAgo(option.minutes);
              }}
            />
          ))}
          {/*
            Reads back the chosen time once there is one, so the row still says when
            the reading was taken without having to reopen the sheet to find out.
          */}
          <Chip
            label={customAt ? `${describeDay(customAt)}, ${formatTime(customAt)}` : 'Custom…'}
            selected={customAt !== null}
            onPress={() => setWhenOpen(true)}
          />
        </View>
      </View>

      <WhenSheet
        visible={whenOpen}
        value={measuredAt}
        onCancel={() => setWhenOpen(false)}
        onConfirm={(picked) => {
          setCustomAt(picked);
          setWhenOpen(false);
        }}
      />

      <View style={{ gap: spacing.sm }}>
        <Label>What was going on</Label>
        <TextInput
          value={note}
          onChangeText={setNote}
          onFocus={() => setNoteFocused(true)}
          onBlur={() => setNoteFocused(false)}
          placeholder="Stressful morning, slept badly, just walked in…"
          placeholderTextColor={colors.textFaint}
          multiline
          style={[styles.noteInput, noteFocused && { borderColor: colors.accent }]}
        />
      </View>

      {/*
        Tags are collapsed by default. The note is what people actually want to
        write; tags are for the analysis, and should never stand between a reading
        and being saved.
      */}
      <Pressable onPress={() => setShowContext((v) => !v)} accessibilityRole="button">
        <Caption>{showContext ? '− Hide tags' : '+ Add tags'}</Caption>
      </Pressable>

      {showContext ? (
        <View style={styles.chipRow}>
          {tags.map((tag) => (
            <Chip
              key={tag.id}
              label={tag.label}
              selected={selectedTags.includes(tag.id)}
              onPress={() =>
                setSelectedTags((current) =>
                  current.includes(tag.id)
                    ? current.filter((id) => id !== tag.id)
                    : [...current, tag.id],
                )
              }
            />
          ))}
          <Chip label="Edit tags…" selected={false} onPress={() => router.push('/tags')} />
        </View>
      ) : null}

      <ErrorNote message={error} />

      <View style={{ gap: spacing.sm, marginTop: 'auto' }}>
        {/* A disabled button with no explanation is a dead end. Say what is missing. */}
        {complete && problems.length === 0 && posture === null ? (
          <Caption>Choose a position to save this reading.</Caption>
        ) : null}
        <Button label="Save reading" onPress={save} loading={saving} disabled={!ready} />
        <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function NumberField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      {/*
        One line, always. These three labels sit in a row of equal columns, so a
        label that wraps drags its own input below the other two.
      */}
      <Label numberOfLines={1}>{label}</Label>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, '').slice(0, 3))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        placeholder="—"
        placeholderTextColor={colors.textFaint}
        autoFocus={autoFocus}
        selectTextOnFocus
        accessibilityLabel={label}
        style={[styles.numberInput, focused && styles.numberInputFocused]}
      />
    </View>
  );
}

const formatTime = (date: Date) =>
  date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && { opacity: 0.7 }]}
    >
      <Text style={[type.caption, { color: selected ? colors.accentText : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  numbers: { flexDirection: 'row', gap: spacing.sm },
  field: { flex: 1, flexBasis: 0, gap: spacing.xs },
  numberInput: {
    // Not type.reading. That is 56px, sized for showing a saved reading on its own,
    // and three of them side by side in a phone-width row made boxes half a screen
    // tall that a three-digit number still crowded. 40 is large enough to check a
    // number at arm's length, which is all this field is for.
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 48,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    textAlign: 'center',
  },
  // Replaces the browser's own focus ring, which is amber on this palette and
  // lands on the one screen where amber already means "the parser was unsure".
  numberInputFocused: { borderColor: colors.accent },
  noteInput: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: spacing.md,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderLeftWidth: 4,
    paddingLeft: spacing.md,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.accent },
});
