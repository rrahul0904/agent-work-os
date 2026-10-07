const PRIORITIES = new Set(["low", "normal", "high"]);
const STATUSES = new Set(["todo", "done"]);

export class WorkspaceError extends Error {
  constructor(code, status = 400, message = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function emptyWorkspace() {
  return { projects: {}, tasks: {}, events: {}, workdays: {}, notes: {} };
}

export function normalizeWorkspace(value = {}) {
  return {
    projects: asRecord(value.projects),
    tasks: asRecord(value.tasks),
    events: asRecord(value.events),
    workdays: asRecord(value.workdays),
    notes: asRecord(value.notes)
  };
}

export function createProjectRecord(id, input, now) {
  return {
    id,
    name: requiredText(input.name, "project_name", 120),
    description: optionalText(input.description, 1000),
    status: "active",
    createdAt: now,
    updatedAt: now
  };
}

export function createTaskRecord(id, input, now, workspace) {
  const projectId = optionalProjectId(input.projectId, workspace);
  return {
    id,
    projectId,
    title: requiredText(input.title, "task_title", 240),
    category: optionalText(input.category, 80),
    priority: enumValue(input.priority ?? "normal", PRIORITIES, "task_priority"),
    dueDate: optionalDate(input.dueDate),
    status: "todo",
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };
}

export function patchTaskRecord(task, patch, now, workspace) {
  if (Object.hasOwn(patch, "projectId")) task.projectId = optionalProjectId(patch.projectId, workspace);
  if (Object.hasOwn(patch, "title")) task.title = requiredText(patch.title, "task_title", 240);
  if (Object.hasOwn(patch, "category")) task.category = optionalText(patch.category, 80);
  if (Object.hasOwn(patch, "priority")) task.priority = enumValue(patch.priority, PRIORITIES, "task_priority");
  if (Object.hasOwn(patch, "dueDate")) task.dueDate = optionalDate(patch.dueDate);
  if (Object.hasOwn(patch, "status")) {
    const next = enumValue(patch.status, STATUSES, "task_status");
    if (next !== task.status) {
      task.status = next;
      task.completedAt = next === "done" ? now : null;
    }
  }
  task.updatedAt = now;
  return task;
}

export function createEventRecord(id, input, now, workspace) {
  const startAt = requiredDateTime(input.startAt, "event_start");
  const endAt = input.endAt ? requiredDateTime(input.endAt, "event_end") : null;
  if (endAt && Date.parse(endAt) < Date.parse(startAt)) throw new WorkspaceError("event_end_before_start");
  return {
    id,
    projectId: optionalProjectId(input.projectId, workspace),
    title: requiredText(input.title, "event_title", 240),
    startAt,
    endAt,
    note: optionalText(input.note, 1000),
    createdAt: now,
    updatedAt: now
  };
}

export function createWorkdayRecord(id, input, now) {
  const date = requiredDate(input.date, "workday_date");
  const startedAt = requiredDateTime(input.startedAt, "workday_start");
  const endedAt = input.endedAt ? requiredDateTime(input.endedAt, "workday_end") : null;
  if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) throw new WorkspaceError("workday_end_before_start");
  const breakMinutes = boundedInteger(input.breakMinutes ?? 0, 0, 1440, "break_minutes");
  const elapsedMinutes = endedAt ? Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 60000) : 0;
  return {
    id,
    date,
    startedAt,
    endedAt,
    breakMinutes,
    elapsedMinutes,
    netMinutes: Math.max(0, elapsedMinutes - breakMinutes),
    note: optionalText(input.note, 1000),
    createdAt: now,
    updatedAt: now
  };
}

export function createNoteRecord(id, input, now, workspace) {
  const title = optionalText(input.title, 160);
  const body = optionalText(input.body, 20_000);
  if (!title && !body) throw new WorkspaceError("note_content_required");
  return {
    id,
    projectId: optionalProjectId(input.projectId, workspace),
    title,
    body,
    createdAt: now,
    updatedAt: now
  };
}

export function patchNoteRecord(note, patch, now, workspace) {
  if (Object.hasOwn(patch, "projectId")) note.projectId = optionalProjectId(patch.projectId, workspace);
  if (Object.hasOwn(patch, "title")) note.title = optionalText(patch.title, 160);
  if (Object.hasOwn(patch, "body")) note.body = optionalText(patch.body, 20_000);
  if (!note.title && !note.body) throw new WorkspaceError("note_content_required");
  note.updatedAt = now;
  return note;
}

export function workspaceSnapshot(workspace) {
  const projects = Object.values(workspace.projects).sort((a, b) => a.name.localeCompare(b.name));
  const tasks = Object.values(workspace.tasks).sort((a, b) => {
    if (a.status !== b.status) return a.status === "todo" ? -1 : 1;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  const events = Object.values(workspace.events).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const workdays = Object.values(workspace.workdays).sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt));
  const notes = Object.values(workspace.notes).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const metrics = {
    activeProjects: projects.filter((project) => project.status === "active").length,
    openTasks: tasks.filter((task) => task.status === "todo").length,
    completedTasks: tasks.filter((task) => task.status === "done").length,
    totalNetMinutes: workdays.reduce((sum, day) => sum + day.netMinutes, 0)
  };
  return { projects, tasks, events, workdays, notes, metrics, motivation: motivationFor(metrics, notes.length) };
}

function motivationFor(metrics, noteCount) {
  const messages = [
    "Choose one concrete finish line and protect it from new distractions.",
    "Small completed loops beat a crowded board. Close the next useful one.",
    "Your plan only needs to make the next decision easier.",
    "Keep the board light: finish, record, then pull the next task.",
    "Progress is easier to trust when the work and the evidence live together."
  ];
  const index = (metrics.completedTasks * 3 + metrics.activeProjects * 5 + metrics.openTasks + noteCount) % messages.length;
  return messages[index];
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}
function requiredText(value, code, max) {
  const text = String(value ?? "").trim();
  if (!text) throw new WorkspaceError(`${code}_required`);
  if (text.length > max) throw new WorkspaceError(`${code}_too_long`);
  return text;
}
function optionalText(value, max) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (text.length > max) throw new WorkspaceError("text_too_long");
  return text;
}
function optionalProjectId(value, workspace) {
  if (value === null || value === undefined || value === "") return null;
  const id = String(value);
  if (!workspace.projects[id]) throw new WorkspaceError("project_not_found", 404);
  return id;
}
function enumValue(value, allowed, code) {
  const next = String(value ?? "");
  if (!allowed.has(next)) throw new WorkspaceError(`${code}_invalid`);
  return next;
}
function requiredDate(value, code) {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) throw new WorkspaceError(`${code}_invalid`);
  return text;
}
function optionalDate(value) {
  if (value === null || value === undefined || value === "") return null;
  return requiredDate(value, "due_date");
}
function requiredDateTime(value, code) {
  const text = String(value ?? "");
  if (!text || Number.isNaN(Date.parse(text))) throw new WorkspaceError(`${code}_invalid`);
  return new Date(text).toISOString();
}
function boundedInteger(value, min, max, code) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new WorkspaceError(`${code}_invalid`);
  return number;
}
