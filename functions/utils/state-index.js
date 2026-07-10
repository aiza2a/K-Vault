const KV_LIMIT_PATTERNS = [
  'kv put() limit exceeded',
  'daily limit',
  'limit exceeded for the day',
  'too many writes',
];

function isKvWriteLimit(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return KV_LIMIT_PATTERNS.some((pattern) => text.includes(pattern));
}

function indexKey(key) {
  return `state:${String(key || '')}`;
}

export async function writeState(env, key, value, options = {}) {
  if (!env?.img_url) throw new Error('KV binding img_url is not configured.');
  try {
    await env.img_url.put(key, value, options);
    return { store: 'kv' };
  } catch (error) {
    if (!isKvWriteLimit(error) || !env.FILE_INDEX_DB) throw error;
    await env.FILE_INDEX_DB
      .prepare(
        `INSERT INTO state_index (state_key, value_json, metadata_json, expires_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(state_key) DO UPDATE SET
           value_json = excluded.value_json,
           metadata_json = excluded.metadata_json,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`
      )
      .bind(
        indexKey(key),
        String(value ?? ''),
        JSON.stringify(options.metadata || null),
        options.expirationTtl ? Date.now() + Number(options.expirationTtl) * 1000 : null,
        Date.now()
      )
      .run();
    return { store: 'd1' };
  }
}

export async function readState(env, key, options = {}) {
  if (env?.img_url) {
    const value = await env.img_url.get(key, options);
    if (value != null) return value;
  }
  if (!env?.FILE_INDEX_DB) return null;
  const row = await env.FILE_INDEX_DB
    .prepare('SELECT value_json, expires_at FROM state_index WHERE state_key = ?1 LIMIT 1')
    .bind(indexKey(key))
    .first();
  if (!row) return null;
  if (row.expires_at && Date.now() > Number(row.expires_at)) {
    return null;
  }
  if (options.type === 'json') {
    try {
      return JSON.parse(row.value_json);
    } catch {
      return null;
    }
  }
  return row.value_json;
}

export async function deleteState(env, key) {
  const results = await Promise.allSettled([
    env?.img_url ? env.img_url.delete(key) : Promise.resolve(),
    env?.FILE_INDEX_DB
      ? env.FILE_INDEX_DB.prepare('DELETE FROM state_index WHERE state_key = ?1').bind(indexKey(key)).run()
      : Promise.resolve(),
  ]);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
}
