import { classify, BP_CATEGORY_LABEL } from '@mp/shared';
import { SLOTS, SLOT_HOURS, SLOT_LABEL, type Cell, type DiaryRow } from '../lib/diary';

/**
 * The blood-pressure diary: one row per day, one column per part of the day.
 *
 * This is the layout a clinician already reads on paper. A chronological list
 * makes them do the grouping in their head during a ten-minute appointment; a
 * grid makes "his mornings are always high" visible at a glance.
 */
export function DiaryTable({ rows }: { rows: DiaryRow[] }) {
  if (rows.length === 0) {
    return <p className="muted">No readings in this period.</p>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="diary">
        <thead>
          <tr>
            <th scope="col" className="day-col">Day</th>
            {SLOTS.map((slot) => (
              <th key={slot} scope="col">
                {SLOT_LABEL[slot]}
                <span className="hours">{SLOT_HOURS[slot]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day}>
              <th scope="row" className="day-col">
                {formatDay(row.day)}
              </th>
              {SLOTS.map((slot) => (
                <td key={slot}>
                  <SlotCell cell={row.slots[slot]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlotCell({ cell }: { cell: Cell | undefined }) {
  // An empty slot is information too - it says they did not measure then.
  if (!cell) return <span className="faint">—</span>;

  const category = classify(cell.systolic, cell.diastolic);
  const title = [
    BP_CATEGORY_LABEL[category],
    `${cell.readings} ${cell.readings === 1 ? 'measurement' : 'measurements'}`,
    ...cell.notes,
    ...cell.tags,
  ].join(' · ');

  return (
    <span className="cell" title={title}>
      <span className={`dot cat-${category}`} aria-hidden="true" />
      <span className="value tabular">
        {round(cell.systolic)}/{round(cell.diastolic)}
      </span>
      {/* Says the number is an average of several, without shouting about it. */}
      {cell.readings > 1 ? <span className="count">×{cell.readings}</span> : null}
      {/* Colour never carries the category alone: it is in the tooltip and, for
          anything above normal, printed next to the number. */}
      {category !== 'normal' ? (
        <span className="sr-only">{BP_CATEGORY_LABEL[category]}</span>
      ) : null}
    </span>
  );
}

const round = (value: number) => Math.round(value);

function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const d = new Date(Date.UTC(year!, month! - 1, date!));
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
