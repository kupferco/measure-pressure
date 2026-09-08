import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
 *
 * Order matters because the capture screen shows tags in this order, and the ones
 * you reach for at 7am should be first. Rows are dragged by the handle on the
 * right.
 */

/**
 * Rows are a fixed height so a drag can be turned into an index with arithmetic
 * rather than measurement. Anything that would make a row taller - a long label,
 * a usage count - is kept on one line for the same reason.
 */
const ROW_HEIGHT = 56;
const ROW_GAP = 8;
const SLOT = ROW_HEIGHT + ROW_GAP;

interface DragState {
  id: string;
  fromIndex: number;
  dy: number;
}

export default function TagsScreen() {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [label, setLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // PanResponder callbacks are created once and close over their first render,
  // so anything they need has to be read through a ref rather than from state.
  const tagsRef = useRef<Tag[] | null>(null);
  tagsRef.current = tags;

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
      // The created tag comes back from the API, so the list updates from the
      // response rather than depending on a second request to reflect it.
      const { tag } = await api.createTag({ label: trimmed, group: 'custom' });
      setTags((current) => [tag, ...(current ?? [])]);
      setLabel('');
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
    setTags((current) => current?.map((t) => (t.id === id ? { ...t, label: trimmed } : t)) ?? null);
    try {
      await api.updateTag(id, { label: trimmed });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename that tag.');
      await load();
    }
  };

  const remove = async (tag: Tag) => {
    const used = (tag.usageCount ?? 0) > 0;
    const message = used
      ? `“${tag.label}” is on ${tag.usageCount} reading${tag.usageCount === 1 ? '' : 's'}. It will stop appearing on the capture screen, but those readings keep it.`
      : `Remove “${tag.label}”?`;

    const proceed =
      Platform.OS === 'web'
        ? (globalThis.confirm?.(message) ?? true)
        : await new Promise<boolean>((resolve) =>
            Alert.alert(used ? 'Hide this tag' : 'Remove tag', message, [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: used ? 'Hide' : 'Remove', style: 'destructive', onPress: () => resolve(true) },
            ]),
          );
    if (!proceed) return;

    setTags((current) => current?.filter((t) => t.id !== tag.id) ?? null);
    try {
      await api.deleteTag(tag.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that tag.');
      await load();
    }
  };

  /** Where a row currently being dragged would land if released now. */
  const targetIndexOf = (state: DragState, total: number) =>
    Math.max(0, Math.min(total - 1, state.fromIndex + Math.round(state.dy / SLOT)));

  const finishDrag = async (state: DragState) => {
    const current = tagsRef.current;
    setDrag(null);
    if (!current) return;

    const to = targetIndexOf(state, current.length);
    if (to === state.fromIndex) return;

    const reordered = [...current];
    const [moved] = reordered.splice(state.fromIndex, 1);
    reordered.splice(to, 0, moved!);
    // Optimistic: the row should stay where it was dropped, not jump back and
    // settle once the network agrees.
    setTags(reordered);

    try {
      await api.reorderTags(reordered.map((t) => t.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the new order.');
      await load();
    }
  };

  if (!tags) return <Loading />;

  return (
    // The page must not scroll while a row is being dragged, or the row and the
    // list move at once and the drop lands somewhere nobody chose.
    <Screen scrollEnabled={drag === null}>
      <Caption>
        Tags are optional. They exist so the app can compare readings later - “higher on days I
        slept badly” needs something to count. Tap a name or ✎ to rename it, ✕ to remove it, and
        drag ≡ to change the order they appear in when you save a reading.
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

        <View style={{ gap: ROW_GAP }}>
          {tags.map((tag, index) => (
            <TagRow
              key={tag.id}
              tag={tag}
              index={index}
              total={tags.length}
              drag={drag}
              editing={editingId === tag.id}
              editingLabel={editingLabel}
              onEditingLabel={setEditingLabel}
              onStartEditing={() => {
                setEditingId(tag.id);
                setEditingLabel(tag.label);
              }}
              onRename={() => rename(tag.id)}
              onRemove={() => remove(tag)}
              onDragStart={() => setDrag({ id: tag.id, fromIndex: index, dy: 0 })}
              onDragMove={(dy) => setDrag((d) => (d && d.id === tag.id ? { ...d, dy } : d))}
              onDragEnd={(dy) => finishDrag({ id: tag.id, fromIndex: index, dy })}
              targetIndexOf={targetIndexOf}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

function TagRow({
  tag,
  index,
  total,
  drag,
  editing,
  editingLabel,
  onEditingLabel,
  onStartEditing,
  onRename,
  onRemove,
  onDragStart,
  onDragMove,
  onDragEnd,
  targetIndexOf,
}: {
  tag: Tag;
  index: number;
  total: number;
  drag: DragState | null;
  editing: boolean;
  editingLabel: string;
  onEditingLabel: (next: string) => void;
  onStartEditing: () => void;
  onRename: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void;
  targetIndexOf: (state: DragState, total: number) => number;
}) {
  const isDragging = drag?.id === tag.id;

  /*
   * The PanResponder is created once - rebuilding it every render loses the
   * gesture halfway through a drag - which means its callbacks close over the
   * first render and nothing after it.
   *
   * That matters here more than usual, because a successful drag reorders the
   * list and every row's index changes. A handler still holding its original
   * index computes the move from the wrong row, which usually resolves to no
   * move at all: the first drag works and every one after it silently does
   * nothing. So the callbacks are reached through a ref that is refreshed on
   * every render, and the responder itself stays put.
   */
  const latest = useRef({ onDragStart, onDragMove, onDragEnd });
  latest.current = { onDragStart, onDragMove, onDragEnd };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // A few pixels of slop so a tap on the handle is not read as a drag.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 3,
      onPanResponderGrant: () => latest.current.onDragStart(),
      onPanResponderMove: (_e, g) => latest.current.onDragMove(g.dy),
      onPanResponderRelease: (_e, g) => latest.current.onDragEnd(g.dy),
      onPanResponderTerminate: (_e, g) => latest.current.onDragEnd(g.dy),
    }),
  ).current;

  /*
   * Rows that the dragged one has passed step aside by exactly one slot, so the
   * gap under the finger is always where the row would land.
   */
  let shift = 0;
  if (drag && !isDragging) {
    const to = targetIndexOf(drag, total);
    if (to > drag.fromIndex && index > drag.fromIndex && index <= to) shift = -SLOT;
    else if (to < drag.fromIndex && index >= to && index < drag.fromIndex) shift = SLOT;
  }

  return (
    <View
      style={[
        styles.row,
        { transform: [{ translateY: isDragging ? drag.dy : shift }] },
        isDragging && styles.rowDragging,
      ]}
    >
      {editing ? (
        <TextInput
          value={editingLabel}
          onChangeText={onEditingLabel}
          onBlur={onRename}
          onSubmitEditing={onRename}
          autoFocus
          maxLength={60}
          style={[styles.input, { flex: 1 }]}
        />
      ) : (
        <Pressable
          style={styles.labelCell}
          accessibilityRole="button"
          accessibilityLabel={`Rename ${tag.label}`}
          onPress={onStartEditing}
        >
          <Body style={{ flexShrink: 1 }}>{tag.label}</Body>
          {tag.usageCount ? <Caption>· used {tag.usageCount}×</Caption> : null}
        </Pressable>
      )}

      {/*
        Tapping the label renames too, but nothing announces that, so the action
        is also here where it can be seen. Glyphs rather than words because three
        actions and a label do not fit across a narrow phone otherwise; each
        carries an accessible name.
      */}
      {!editing ? (
        <Pressable
          onPress={onStartEditing}
          accessibilityRole="button"
          accessibilityLabel={`Rename ${tag.label}`}
          hitSlop={6}
          style={styles.action}
        >
          <Text style={styles.actionGlyph}>✎</Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${tag.label}`}
        hitSlop={6}
        style={styles.action}
      >
        <Text style={[styles.actionGlyph, { color: colors.danger }]}>✕</Text>
      </Pressable>

      {/* The handle, not the whole row: tapping a row renames it. */}
      <View
        {...responder.panHandlers}
        accessibilityLabel={`Reorder ${tag.label}`}
        accessibilityHint="Drag up or down to change where this tag appears"
        style={styles.handle}
      >
        <Text style={styles.handleGlyph}>≡</Text>
      </View>
    </View>
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
    paddingHorizontal: spacing.md,
    height: 48,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    height: ROW_HEIGHT,
  },
  rowDragging: {
    backgroundColor: colors.surfaceRaised,
    // Lifts the dragged row above its neighbours as they step aside.
    zIndex: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  labelCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  action: {
    width: 36,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGlyph: { fontSize: 16, color: colors.textMuted },
  handle: {
    width: 40,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    /*
     * Web only, and both properties matter. touchAction: none tells the browser
     * this element's gestures are ours, which is what stops a drag on a phone
     * from scrolling the page instead. userSelect: none stops a drag on a desktop
     * from selecting the text it passes over. React Native's style types know
     * about neither, but react-native-web honours both.
     */
    ...(Platform.OS === 'web'
      ? ({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as object)
      : {}),
  },
  handleGlyph: { fontSize: 20, color: colors.textFaint },
});
