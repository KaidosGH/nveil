// Schema-drift self-check: the runtime DDL in lib/db-init.ts and the typed
// drizzle schema in drizzle/schema.ts must describe the same columns. They
// are maintained by hand (see the ponytail note in db-init.ts); without this
// check a drifted column compiles fine and only fails at runtime.
//
// Run: npm run check
// (equivalently: node --experimental-strip-types tests/schema-drift.test.mjs —
// the flag is a no-op on Node >= 22.18 where type stripping is default)
import assert from 'node:assert/strict';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { SQL } from 'drizzle-orm';
import { INIT_SQL } from '../lib/schema-ddl.ts';
import { secrets, abuseReports } from '../drizzle/schema.ts';

/**
 * Maps a drizzle column to the DDL type string it must appear as in INIT_SQL.
 * timestamptz covers PgTimestamp/PgTimestampString — schema.ts only uses
 * `{ withTimezone: true }` variants.
 */
const DDL_TYPE = {
  PgText: 'text',
  PgBoolean: 'boolean',
  PgTimestamp: 'timestamptz',
  PgInteger: 'integer',
};

/** Parses the CREATE TABLE blocks of INIT_SQL into { table: { name: def } }. */
function parseDdl(sql) {
  const tables = {};
  for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\n\);/gs)) {
    const [, table, body] = m;
    tables[table] = {};
    for (const line of body.split('\n')) {
      const def = line.trim().replace(/,$/, '');
      if (!def) continue;
      const name = def.split(/\s+/)[0];
      tables[table][name] = def;
    }
  }
  return tables;
}

/** The DEFAULT expression in a DDL column definition, or null when absent. */
function ddlDefault(def) {
  const m = def.match(/\bDEFAULT\s+(.+?)(\s+NOT NULL)?$/);
  return m ? m[1].trim() : null;
}

/** The drizzle column's default, normalized to the DDL's expression form:
 *  booleans -> "false"/"true", SQL defaults (now()) -> their raw SQL text. */
function drizzleDefault(col) {
  if (!col.hasDefault) return null;
  const d = col.default;
  if (d instanceof SQL) {
    return d.queryChunks
      .map((c) => (typeof c === 'string' ? c : Array.isArray(c?.value) ? c.value.join('') : ''))
      .join('')
      .trim();
  }
  return String(d);
}

/** Asserts one drizzle column agrees with one DDL definition (CREATE or ALTER). */
function assertColumnAgrees(tableName, col, def, where) {
  const label = `${tableName}.${col.name}${where}`;

  const type = DDL_TYPE[col.columnType] ?? col.columnType;
  assert.ok(def.includes(type), `${label}: DDL "${def}" does not use type ${type}`);

  // Primary-key status, both directions (e.g. PRIMARY KEY dropped from the
  // id line would let a deployed table accept duplicate ids).
  assert.equal(
    /PRIMARY KEY/.test(def),
    col.primary,
    `${label}: primary-key mismatch (DDL "${def}" vs drizzle primary=${col.primary})`,
  );

  // Nullability (PRIMARY KEY implies NOT NULL in the DDL).
  if (col.notNull) {
    assert.ok(/NOT NULL|PRIMARY KEY/.test(def), `${label}: drizzle says NOT NULL, DDL lacks it`);
  } else {
    assert.ok(!/NOT NULL/.test(def), `${label}: DDL marks it NOT NULL, drizzle does not`);
  }

  // Default expression by value, not just presence (e.g. DEFAULT true where
  // drizzle says false must fail).
  const ddlD = ddlDefault(def);
  const drizzleD = drizzleDefault(col);
  assert.equal(
    ddlD,
    drizzleD,
    `${label}: default expression mismatch (DDL DEFAULT ${ddlD} vs drizzle ${drizzleD})`,
  );
}

const ddl = parseDdl(INIT_SQL);
const expectedTables = { secrets, abuse_reports: abuseReports };

for (const [tableName, table] of Object.entries(expectedTables)) {
  const cfg = getTableConfig(table);
  const ddlCols = ddl[tableName];
  assert.ok(ddlCols, `INIT_SQL is missing a CREATE TABLE for ${tableName}`);

  for (const col of cfg.columns) {
    const def = ddlCols[col.name];
    assert.ok(def, `${tableName}.${col.name} exists in drizzle/schema.ts but not in INIT_SQL`);
    assertColumnAgrees(tableName, col, def, '');
  }

  const extra = Object.keys(ddlCols).filter((name) => !cfg.columns.some((c) => c.name === name));
  assert.deepEqual(extra, [], `${tableName}: INIT_SQL defines columns missing from schema.ts`);
}

// ALTER ... ADD COLUMN lines exist for pre-drizzle deployments; their column
// definitions must agree with schema.ts just like the CREATE TABLE ones.
for (const m of INIT_SQL.matchAll(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (.+?);/g)) {
  const [, table, colDef] = m;
  const tableObj = expectedTables[table];
  assert.ok(tableObj, `ALTER TABLE line targets unknown table ${table}`);
  const def = colDef.trim();
  const colName = def.split(/\s+/)[0];
  const col = getTableConfig(tableObj).columns.find((c) => c.name === colName);
  assert.ok(col, `ALTER TABLE line targets unknown column ${table}.${colName}`);
  assertColumnAgrees(table, col, def, ' (ALTER)');
}

console.log('schema drift self-check passed');
