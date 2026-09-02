import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RANGES, type RangeId } from '../lib/ranges';
import { colors, radius, spacing, type } from '../lib/theme';

/**
 * The segmented control above a chart. Deliberately the shape people already know
 * from Health and Fitness apps, because it needs no explaining.
 */
export function RangeTabs({
  value,
  onChange,
}: {
  value: RangeId;
  onChange: (next: RangeId) => void;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {RANGES.map((range) => {
        const selected = range.id === value;
        return (
          <Pressable
            key={range.id}
            onPress={() => onChange(range.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={range.spoken}
            style={[styles.tab, selected && styles.tabSelected]}
          >
            <Text style={[type.caption, styles.label, selected && styles.labelSelected]}>
              {range.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 3,
    gap: 2,
  },
  tab: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm - 2,
  },
  tabSelected: { backgroundColor: colors.surfaceRaised },
  label: { color: colors.textMuted, fontWeight: '600' },
  labelSelected: { color: colors.text },
});
