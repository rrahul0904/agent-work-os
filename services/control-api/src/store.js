import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createEventRecord,
  createNoteRecord,
  createProjectRecord,
  createTaskRecord,
  createWorkdayRecord,
  emptyWorkspace,
  normalizeWorkspace,
  patchNoteRecord,
  patchTaskRecord,
  WorkspaceError,
  workspaceSnapshot
} from "./workspace.js";

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { machines: {}, sessions: {}, workspace: emptyWorkspace() };
    this.writeChain = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      this.state = {
        machines: parsed.machines ?? {},
        sessions: parsed.sessions ?? {},
        workspace: normalizeWorkspace(parsed.workspace)
      };
      for (const machine of Object.values(this.state.machines)) machine.status = "offline";
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  listMachines() { return Object.values(this.state.machines).sort((a, b) => a.name.localeCompare(b.name)); }
  listSessions() { return Object.values(this.state.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  getMachine(id) { return this.state.machines[id]; }
  getSession(id) { return this.state.sessions[id]; }
  getWorkspace() { return workspaceSnapshot(this.state.workspace); }

  async upsertMachine(machine) { this.state.machines[machine.id] = machine; await this.#persist(); return machine; }
  async touchMachine(id) {
    const machine = this.getMachine(id); if (!machine) return;
    machine.status = "online"; machine.lastSeenAt = new Date().toISOString(); await this.#persist(); return machine;
  }
  async markMachineOffline(id) {
    const machine = this.getMachine(id); if (!machine) return;
    machine.status = "offline"; machine.lastSeenAt = new Date().toISOString(); await this.#persist(); return machine;
  }
  async createSession(session) { this.state.sessions[session.id] = session; await this.#persist(); return session; }
  async addMessage(id, message) { const s = this.#session(id); s.messages.push(message); s.updatedAt = new Date().toISOString(); await this.#persist(); return s; }
  async addEvent(id, event) {
    const s = this.#session(id); s.events.push(event); s.updatedAt = new Date().toISOString();
    if (event.kind === "status") s.status = event.status;
    if (event.kind === "thread") s.nativeSessionId = event.nativeSessionId;
    if (event.kind === "text" && event.text?.trim()) {
      s.messages.push({ id: crypto.randomUUID(), role: "assistant", text: event.text, createdAt: event.at });
    }
    await this.#persist(); return s;
  }
  async setSessionStatus(id, status) { const s = this.#session(id); s.status = status; s.updatedAt = new Date().toISOString(); await this.#persist(); return s; }

  async createProject(input) {
    const now = new Date().toISOString();
    const project = createProjectRecord(crypto.randomUUID(), input, now);
    this.state.workspace.projects[project.id] = project; await this.#persist(); return project;
  }
  async createTask(input) {
    const now = new Date().toISOString();
    const task = createTaskRecord(crypto.randomUUID(), input, now, this.state.workspace);
    this.state.workspace.tasks[task.id] = task; await this.#persist(); return task;
  }
  async updateTask(id, patch) {
    const task = this.state.workspace.tasks[id];
    if (!task) throw new WorkspaceError("task_not_found", 404);
    patchTaskRecord(task, patch, new Date().toISOString(), this.state.workspace); await this.#persist(); return task;
  }
  async createCalendarEvent(input) {
    const now = new Date().toISOString();
    const event = createEventRecord(crypto.randomUUID(), input, now, this.state.workspace);
    this.state.workspace.events[event.id] = event; await this.#persist(); return event;
  }
  async createWorkday(input) {
    const now = new Date().toISOString();
    const workday = createWorkdayRecord(crypto.randomUUID(), input, now);
    this.state.workspace.workdays[workday.id] = workday; await this.#persist(); return workday;
  }
  async createNote(input) {
    const now = new Date().toISOString();
    const note = createNoteRecord(crypto.randomUUID(), input, now, this.state.workspace);
    this.state.workspace.notes[note.id] = note; await this.#persist(); return note;
  }
  async updateNote(id, patch) {
    const note = this.state.workspace.notes[id];
    if (!note) throw new WorkspaceError("note_not_found", 404);
    patchNoteRecord(note, patch, new Date().toISOString(), this.state.workspace); await this.#persist(); return note;
  }

  #session(id) { const s = this.getSession(id); if (!s) throw new Error(`Unknown session: ${id}`); return s; }
  #persist() {
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temp = `${this.filePath}.tmp`;
      await writeFile(temp, snapshot, "utf8"); await rename(temp, this.filePath);
    });
    return this.writeChain;
  }
}
