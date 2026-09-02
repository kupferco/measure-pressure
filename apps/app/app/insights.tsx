import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Insight } from '@mp/shared';
import { Body, Caption, Card, EmptyState, ErrorNote, Heading, Label, Loading, Screen } from '../src/components/ui';
import { api } from '../src/lib/api';
import { colors, radius, seriesColors, spacing, type } from '../src/lib/theme';

/**
 * "What affects my readings" - the reason the app exists, and the screen most able
 * to mislead. Everything here is worded as association, never cause, and anything
 * the numbers do not support is labelled as such rather than hidden.
 */
export default function InsightsScreen() {
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .insights()
      .then(({ insights }) => setInsights(insights))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this.'));
  }, []);

  if (error) return <Screen><ErrorNote message={error} /></Screen>;
  if (!insights) return <Loading />;

  if (insights.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Not enough to compare yet"
          body="Tag a few readings with what was going on - poor sleep, exercise, a stressful day - and this screen starts comparing them. It needs at least five readings on each side of a comparison."
        />
      </Screen>
    );
  }

  const supported = insights.filter((i) => i.confident);
  const unsupported = insights.filter((i) => !i.confident);

  return (
    <Screen>
      {supported.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Label>Stands up to the numbers</Label>
          {supported.map((insight) => (
            <InsightCard key={insight.tagId} insight={insight} />
          ))}
        </View>
      ) : null}

      {unsupported.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Label>Too early to say</Label>
          <Caption>
            A difference is showing, but not one these numbers can separate from ordinary
            day-to-day variation yet.
          </Caption>
          {unsupported.map((insight) => (
            <InsightCard key={insight.tagId} insight={insight} />
          ))}
        </View>
      ) : null}

      <Card style={{ backgroundColor: 'transparent', paddingHorizontal: 0 }}>
        <Caption>
          These are patterns in your own readings, not causes. Each tag is compared against every
          other reading, so overlapping habits can colour a result - if you only do yoga on days you
          slept well, the two get tangled. Worth raising with your doctor; not worth acting on alone.
        </Caption>
      </Card>
    </Screen>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const raises = insight.systolicDelta > 0;
  const magnitude = Math.abs(insight.systolicDelta);

  return (
    <Card>
      <View style={styles.row}>
        <Heading>{insight.label}</Heading>
        <Text
          style={[
            type.heading,
            // Direction is carried by the sign and the sentence below, not by colour alone.
            { color: raises ? seriesColors.diastolic : colors.success },
          ]}
        >
          {raises ? '+' : '−'}
          {magnitude.toFixed(1)}
        </Text>
      </View>

      <Body muted>
        Your systolic runs {magnitude.toFixed(1)} mmHg {raises ? 'higher' : 'lower'} on readings
        tagged “{insight.label}”.
      </Body>

      <View style={styles.meta}>
        <Caption>
          {insight.withCount} tagged · {insight.withoutCount} not
        </Caption>
        {insight.pValue !== null ? (
          <Caption>{insight.pValue < 0.001 ? 'p < 0.001' : `p = ${insight.pValue}`}</Caption>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
});
