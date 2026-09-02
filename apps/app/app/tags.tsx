import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Tag } from '@mp/shared';
import { Body, Button, Caption, ErrorNote, Label, Loading, Screen } from '../src/components/ui';
import { api } from '../src/lib/api';
import { colors, radius, spacing, type } from '../src/lib/theme';

/**
 * Editing the tag list.
 *
 * The starter set is a guess at what matters; this is where it becomes yours.
 * Removing a tag that has been used archives it rather than deleting it, so old
 * readings keep saying what they said.
 */
export default function TagsScreen() {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [label, setLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .listTags()
      .then(({ tags }) => setTags(tags))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your tags.'));

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.createTag({ label: trimmed, group: 'custom' });
      setLabel('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that tag.');
    } finally {
      setBusy(false);
    }
  };

  const rename = async (id: string) => {
    const trimmed = editingLabel.trim();
    setEditingId(null);
    if (!trimmed) return;
    try {
      await api.updateTag(id, { label: trimmed });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename that tag.');
    }
  };

  const remove = async (tag: Tag) => {
    const used = (tag.usageCount ?? 0) > 0;
    const message = used
      ? `“${tag.label}” is on ${tag.usageCount} reading${tag.usageCount === 1 ? '' : 's'}. It will stop appearing on the capture screen, but those readings keep it.`
      : `Remove “${tag.label}”?`;

    const proceed =
      Platform.OS === 'web'
        ? globalThis.confirm?.(message) ?? true
        : await new Promise<boolean>((resolve) =>
            Alert.alert(used ? 'Hide this tag' : 'Remove tag', message, [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: used ? 'Hide' : 'Remove', style: 'destructive', onPress: () => resolve(true) },
            ]),
          );
    if (!proceed) return;

    try {
      await api.deleteTag(tag.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that tag.');
    }
  };

  if (!tags) return <Loading />;

  return (
    <Screen>
      <Caption>
        Tags are optional. They exist so the app can compare readings later - “higher on days I
        slept badly” needs something to count.
      </Caption>

      <View style={styles.addRow}>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Add a tag…"
          placeholderTextColor={colors.textFaint}
          onSubmitEditing={add}
          returnKeyType="done"
          maxLength={60}
          accessibilityLabel="New tag name"
          style={styles.input}
        />
        <Button label="Add" onPress={add} loading={busy} style={{ paddingHorizontal: spacing.lg }} />
      </View>

      <ErrorNote message={error} />

      <View style={{ gap: spacing.sm }}>
        <Label>{tags.length} tags</Label>
        {tags.map((tag) => (
          <View key={tag.id} style={styles.row}>
            {editingId === tag.id ? (
              <TextInput
                value={editingLabel}
                onChangeText={setEditingLabel}
                onBlur={() => rename(tag.id)}
                onSubmitEditing={() => rename(tag.id)}
                autoFocus
                maxLength={60}
                style={[styles.input, { flex: 1 }]}
              />
            ) : (
              <Pressable
                style={{ flex: 1 }}
                accessibilityRole="button"
                accessibilityLabel={`Rename ${tag.label}`}
                onPress={() => {
                  setEditingId(tag.id);
                  setEditingLabel(tag.label);
                }}
              >
                <Body>{tag.label}</Body>
                {tag.usageCount ? <Caption>used {tag.usageCount}×</Caption> : null}
              </Pressable>
            )}

            <Pressable
              onPress={() => remove(tag)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${tag.label}`}
              hitSlop={12}
            >
              <Text style={[type.body, { color: colors.danger }]}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    ...type.body,
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 56,
  },
});
