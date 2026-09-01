import type { CreateTagInput, Tag, TagGroup, UpdateTagInput } from '@mp/shared';
import { query } from '../../db/pool.js';
import { ApiError } from '../../lib/errors.js';

interface TagRow {
  id: string;
  label: string;
  tag_group: string;
  sort_order: number;
  archived_at: Date | null;
  usage_count: number;
}

function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    label: row.label,
    group: row.tag_group as TagGroup,
    sortOrder: row.sort_order,
    archived: row.archived_at !== null,
    usageCount: row.usage_count,
  };
}

/**
 * Usage counts come back with the list so the capture screen can float the tags you
 * actually use to the top, instead of whatever order I happened to seed them in.
 */
export async function listTags(userId: string, includeArchived = false): Promise<Tag[]> {
  const { rows } = await query<TagRow>(
    `select t.id, t.label, t.tag_group, t.sort_order, t.archived_at,
            count(rt.reading_id)::int as usage_count
     from tags t
     left join reading_tags rt on rt.tag_id = t.id
     where t.user_id = $1
       and ($2::boolean or t.archived_at is null)
     group by t.id
     order by t.sort_order, t.label`,
    [userId, includeArchived],
  );
  return rows.map(toTag);
}

export async function createTag(userId: string, input: CreateTagInput): Promise<Tag> {
  const { rows: maxRows } = await query<{ next: number }>(
    'select coalesce(max(sort_order), -1) + 1 as next from tags where user_id = $1',
    [userId],
  );
  try {
    const { rows } = await query<TagRow>(
      `insert into tags (user_id, label, tag_group, sort_order)
       values ($1, $2, $3, $4)
       returning id, label, tag_group, sort_order, archived_at, 0 as usage_count`,
      [userId, input.label, input.group, maxRows[0]?.next ?? 0],
    );
    return toTag(rows[0]!);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === '23505') {
      throw ApiError.conflict(`You already have a tag called "${input.label}".`);
    }
    throw err;
  }
}

export async function updateTag(
  userId: string,
  tagId: string,
  input: UpdateTagInput,
): Promise<Tag> {
  const sets: string[] = [];
  const params: unknown[] = [userId, tagId];
  const push = (fragment: string, value: unknown) => {
    params.push(value);
    sets.push(`${fragment} = $${params.length}`);
  };

  if (input.label !== undefined) push('label', input.label);
  if (input.group !== undefined) push('tag_group', input.group);
  if (input.sortOrder !== undefined) push('sort_order', input.sortOrder);
  if (input.archived !== undefined) {
    sets.push(input.archived ? 'archived_at = now()' : 'archived_at = null');
  }
  if (sets.length === 0) throw ApiError.badRequest('Nothing to update.');

  try {
    const { rows } = await query<TagRow>(
      `update tags set ${sets.join(', ')}
       where user_id = $1 and id = $2
       returning id, label, tag_group, sort_order, archived_at,
                 (select count(*)::int from reading_tags where tag_id = tags.id) as usage_count`,
      params,
    );
    if (!rows[0]) throw ApiError.notFound('Tag not found.');
    return toTag(rows[0]);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === '23505') {
      throw ApiError.conflict('You already have a tag with that name.');
    }
    throw err;
  }
}

/**
 * Archives rather than deletes when the tag has history: a reading tagged two years
 * ago should keep saying what it said. Genuinely unused tags are removed outright.
 */
export async function removeTag(userId: string, tagId: string): Promise<{ archived: boolean }> {
  const { rows } = await query<{ used: number }>(
    `select (select count(*)::int from reading_tags where tag_id = t.id) as used
     from tags t where t.user_id = $1 and t.id = $2`,
    [userId, tagId],
  );
  if (!rows[0]) throw ApiError.notFound('Tag not found.');

  if (rows[0].used > 0) {
    await query('update tags set archived_at = now() where user_id = $1 and id = $2', [
      userId,
      tagId,
    ]);
    return { archived: true };
  }
  await query('delete from tags where user_id = $1 and id = $2', [userId, tagId]);
  return { archived: false };
}

/** Re-orders in one statement so a drag-to-reorder cannot half-apply. */
export async function reorderTags(userId: string, orderedIds: string[]): Promise<Tag[]> {
  await query(
    `update tags set sort_order = pos.idx
     from unnest($2::uuid[]) with ordinality as pos(id, idx)
     where tags.user_id = $1 and tags.id = pos.id`,
    [userId, orderedIds],
  );
  return listTags(userId);
}
