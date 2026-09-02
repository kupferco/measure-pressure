/**
 * Context tags.
 *
 * A free-text note is what a person actually wants to write ("awful meeting with
 * the bank") and it stays the primary field - it can always be analysed later.
 * Tags exist alongside it because free text cannot be averaged: they are what let
 * the app answer "does sleeping badly actually move my numbers?" with arithmetic
 * rather than a guess.
 *
 * Tags are per-user rows in the database, not a fixed list in this file. What
 * follows is only the starter set every new account is seeded with - rename it,
 * add to it, archive what you never use.
 */

export type TagGroup = 'state' | 'activity' | 'intake' | 'health' | 'custom';

export const TAG_GROUP_LABEL: Record<TagGroup, string> = {
  state: 'How you feel',
  activity: 'Before measuring',
  intake: 'Food & medication',
  health: 'Not well',
  custom: 'Yours',
};

export const TAG_GROUPS: readonly TagGroup[] = ['state', 'activity', 'intake', 'health', 'custom'];

export interface SeedTag {
  label: string;
  group: TagGroup;
}

/** Seeded into `tags` when an account is created. Order here is the initial sort order. */
export const SEED_TAGS: readonly SeedTag[] = [
  { label: 'Stressed', group: 'state' },
  { label: 'Relaxed', group: 'state' },
  { label: 'Slept badly', group: 'state' },
  { label: 'Slept well', group: 'state' },
  { label: 'Anxious', group: 'state' },
  { label: 'Tired', group: 'state' },

  { label: 'Exercised', group: 'activity' },
  { label: 'Yoga / breathing', group: 'activity' },
  { label: 'Walked', group: 'activity' },
  { label: 'Rested 5+ min first', group: 'activity' },
  { label: 'Just woke up', group: 'activity' },
  { label: 'Working', group: 'activity' },

  { label: 'Took medication', group: 'intake' },
  { label: 'Missed medication', group: 'intake' },
  { label: 'Caffeine', group: 'intake' },
  { label: 'Alcohol', group: 'intake' },
  { label: 'Salty meal', group: 'intake' },
  { label: 'Large meal', group: 'intake' },

  { label: 'Ill / flu', group: 'health' },
  { label: 'In pain', group: 'health' },
  { label: 'Headache', group: 'health' },
] as const;

/** Which arm / posture the cuff was on - Omron's own guidance is to stay consistent. */
export const ARMS = ['left', 'right', 'unknown'] as const;
export type Arm = (typeof ARMS)[number];

export const POSTURES = ['sitting', 'lying', 'standing', 'unknown'] as const;
export type Posture = (typeof POSTURES)[number];
