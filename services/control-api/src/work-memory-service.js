import { projectWorkMemory, WorkMemoryProjectionError } from "./work-memory-projection.js";

export class WorkMemoryService {
  constructor(store) {
    this.store = store;
  }

  getProjection(workItemId) {
    const workItem = this.store.getWorkItem(workItemId);
    if (!workItem) {
      throw new WorkMemoryProjectionError("work_item_not_found", `Unknown work item: ${workItemId}`);
    }
    const decisions = this.store.listDecisions().filter((decision) => decision.workItemId === workItemId);
    const activity = this.store.listActivity().filter((event) => event.workItemId === workItemId);
    return projectWorkMemory({ workItem, decisions, activity });
  }
}
