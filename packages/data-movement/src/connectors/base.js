export class SourceConnector {
  constructor({ id, system }) {
    if (!id || !system) throw new TypeError("connector_id_and_system_required");
    this.id = id;
    this.system = system;
  }
  async discover() { throw new Error("discover_not_implemented"); }
  async snapshot() { throw new Error("snapshot_not_implemented"); }
  async *changes() { throw new Error("changes_not_implemented"); }
  async checkpoint() { throw new Error("checkpoint_not_implemented"); }
  async health() { return { ok: true, connectorId: this.id, system: this.system }; }
}
