function quoteIdentifier(identifier) {
  if (typeof identifier !== "string" || !identifier.length) throw new TypeError("snowflake_identifier_required");
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableName({ database, schema, table }) {
  return [database, schema, table].map(quoteIdentifier).join(".");
}

function columnsFrom(record) {
  const row = record.after ?? record.before;
  return row && typeof row === "object" ? Object.keys(row).sort() : [];
}

function keyColumns(record) {
  if (!record.key || typeof record.key !== "object" || !Object.keys(record.key).length) throw new Error("snowflake_apply_requires_key");
  return Object.keys(record.key).sort();
}

export function compileSnowflakeMutation(record, destination) {
  const target = tableName(destination);
  const keys = keyColumns(record);
  if (record.operation === "DELETE") {
    const where = keys.map((key) => `${quoteIdentifier(key)} = ?`).join(" AND ");
    return { sql: `DELETE FROM ${target} WHERE ${where}`, binds: keys.map((key) => record.key[key]) };
  }
  if (!["INSERT", "UPDATE", "SNAPSHOT"].includes(record.operation)) throw new Error(`snowflake_operation_not_supported:${record.operation}`);
  const columns = columnsFrom(record);
  const values = columns.map((column) => record.after[column]);
  const select = columns.map((column) => `? AS ${quoteIdentifier(column)}`).join(", ");
  const on = keys.map((key) => `t.${quoteIdentifier(key)} = s.${quoteIdentifier(key)}`).join(" AND ");
  const nonKeys = columns.filter((column) => !keys.includes(column));
  const update = nonKeys.length ? ` WHEN MATCHED THEN UPDATE SET ${nonKeys.map((column) => `t.${quoteIdentifier(column)} = s.${quoteIdentifier(column)}`).join(", ")}` : "";
  const insertColumns = columns.map(quoteIdentifier).join(", ");
  const insertValues = columns.map((column) => `s.${quoteIdentifier(column)}`).join(", ");
  return { sql: `MERGE INTO ${target} t USING (SELECT ${select}) s ON ${on}${update} WHEN NOT MATCHED THEN INSERT (${insertColumns}) VALUES (${insertValues})`, binds: values };
}

export class SnowflakeDestination {
  constructor({ execute, database, schema, tableFor }) {
    if (typeof execute !== "function") throw new TypeError("snowflake_execute_required");
    this.execute = execute;
    this.database = database;
    this.schema = schema;
    this.tableFor = tableFor ?? ((record) => record.source.entity);
  }
  async apply(records) {
    const results = [];
    for (const record of records) {
      const mutation = compileSnowflakeMutation(record, { database: this.database, schema: this.schema, table: this.tableFor(record) });
      results.push(await this.execute(mutation));
    }
    return results;
  }
}
