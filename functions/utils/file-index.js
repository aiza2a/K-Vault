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

export async function writeFileMetadata(env, key, metadata) {
  if (!env?.img_url) {
    throw new Error('KV binding img_url is not configured.');
  }

  try {
    await env.img_url.put(key, '', { metadata });
    return { index: 'kv' };
  } catch (error) {
    if (!isKvWriteLimit(error) || !env.FILE_INDEX_DB) {
      throw error;
    }

    await env.FILE_INDEX_DB
      .prepare(
        `INSERT INTO file_index (file_key, metadata_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(file_key) DO UPDATE SET
           metadata_json = excluded.metadata_json,
           updated_at = excluded.updated_at`
      )
      .bind(key, JSON.stringify(metadata), Date.now())
      .run();
    return { index: 'd1' };
  }
}

export async function readFileMetadata(env, keys) {
  for (const key of keys) {
    if (env?.img_url) {
      const record = await env.img_url.getWithMetadata(key);
      if (record?.metadata) return { key, metadata: record.metadata, source: 'kv' };
    }
  }

  if (!env?.FILE_INDEX_DB || !keys.length) return null;
  const placeholders = keys.map((_, index) => `?${index + 1}`).join(', ');
  const row = await env.FILE_INDEX_DB
    .prepare(`SELECT file_key, metadata_json FROM file_index WHERE file_key IN (${placeholders}) LIMIT 1`)
    .bind(...keys)
    .first();
  if (!row?.metadata_json) return null;

  try {
    return { key: row.file_key, metadata: JSON.parse(row.metadata_json), source: 'd1' };
  } catch {
    return null;
  }
}
