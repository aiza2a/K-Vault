import { readFileMetadata, writeFileMetadata } from '../functions/utils/file-index.js';

class MemoryKV {
  constructor({ failWrites = false } = {}) {
    this.failWrites = failWrites;
    this.store = new Map();
  }

  async put(key, value = '', options = {}) {
    if (this.failWrites) throw new Error('KV put() limit exceeded for the day');
    this.store.set(String(key), { value: String(value), metadata: options.metadata || null });
  }

  async getWithMetadata(key) {
    const entry = this.store.get(String(key));
    return entry ? { value: entry.value, metadata: entry.metadata } : null;
  }
}

class MemoryD1Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async run() {
    const [key, metadataJson, timestamp] = this.values;
    this.db.rows.set(String(key), { file_key: String(key), metadata_json: String(metadataJson), created_at: timestamp, updated_at: timestamp });
    return { success: true };
  }

  async first() {
    for (const key of this.values) {
      const row = this.db.rows.get(String(key));
      if (row) return row;
    }
    return null;
  }
}

class MemoryD1 {
  constructor() {
    this.rows = new Map();
  }

  prepare(sql) {
    return new MemoryD1Statement(this, sql);
  }
}

describe('KV metadata D1 fallback', function () {
  it('writes metadata to D1 after KV daily write exhaustion', async function () {
    const env = { img_url: new MemoryKV({ failWrites: true }), FILE_INDEX_DB: new MemoryD1() };
    const metadata = { fileName: 'image.png', storageType: 'telegram', TimeStamp: 1 };
    const result = await writeFileMetadata(env, 'telegram-file.png', metadata);

    assert.strictEqual(result.index, 'd1');
    const found = await readFileMetadata(env, ['telegram-file.png']);
    assert.strictEqual(found.source, 'd1');
    assert.strictEqual(found.key, 'telegram-file.png');
    assert.deepStrictEqual(found.metadata, metadata);
  });

  it('keeps KV as the preferred metadata source', async function () {
    const env = { img_url: new MemoryKV(), FILE_INDEX_DB: new MemoryD1() };
    const metadata = { fileName: 'image.png', storageType: 'telegram', TimeStamp: 1 };
    const result = await writeFileMetadata(env, 'telegram-file.png', metadata);

    assert.strictEqual(result.index, 'kv');
    const found = await readFileMetadata(env, ['telegram-file.png']);
    assert.strictEqual(found.source, 'kv');
    assert.deepStrictEqual(found.metadata, metadata);
  });
});
