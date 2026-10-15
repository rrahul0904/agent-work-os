export function planReplication({ source, destination, requestedMode = "mirror" }) {
  if (!source?.kind || !destination?.kind) throw new TypeError("source_and_destination_kind_required");
  if (destination.kind !== "snowflake") throw new Error("destination_not_yet_supported");
  const sourceKind = source.kind.toLowerCase();
  if (sourceKind === "postgres" || sourceKind === "postgresql") return Object.freeze({ version: "replication-plan/v1", requestedMode, capture: "owned-postgres-wal", protocol: "change-record/v1", destination: "owned-snowflake-apply", guarantees: ["ordered-source-position", "transaction-metadata", "receipt-backed-apply"] });
  if (sourceKind === "oracle") return Object.freeze({ version: "replication-plan/v1", requestedMode, capture: "owned-oracle-redo", protocol: "change-record/v1", destination: "owned-snowflake-apply", guarantees: ["commit-boundary-reconstruction", "ordered-source-position", "receipt-backed-apply"] });
  if (sourceKind === "api") return Object.freeze({ version: "replication-plan/v1", requestedMode: "incremental", capture: "connector-sdk", protocol: "change-record/v1", destination: "owned-snowflake-apply", guarantees: ["checkpointed-cursor", "receipt-backed-apply"] });
  throw new Error("source_not_yet_supported");
}
