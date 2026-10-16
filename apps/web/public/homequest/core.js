const VERSION = "homequest/v1";

export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function createSeedState(now = new Date()) {
  const key = weekKey(now);
  return {
    version: VERSION,
    household: { id: "home-1", name: "Maple House", weeklyGoal: 240, weekKey: key },
    currentMemberId: "m1",
    members: [
      { id: "m1", name: "Alex", role: "admin", points: 140, weeklyPoints: 95, avatar: "A" },
      { id: "m2", name: "Sam", role: "member", points: 110, weeklyPoints: 80, avatar: "S" }
    ],
    tasks: [
      { id: "t1", title: "Kitchen reset", category: "Kitchen", assigneeId: "m1", points: 20, due: "Today", done: false },
      { id: "t2", title: "Laundry fold", category: "Laundry", assigneeId: "m2", points: 15, due: "Today", done: false },
      { id: "t3", title: "Water plants", category: "Care", assigneeId: "m1", points: 10, due: "Tomorrow", done: false }
    ],
    rewards: [
      { id: "r1", title: "Choose Friday dinner", cost: 120 },
      { id: "r2", title: "No-dishes pass", cost: 70 }
    ],
    completions: [],
    redemptions: [],
    expenses: [
      { id: "e1", title: "Groceries", amount: 64.5, paidBy: "m1", splitBetween: ["m1", "m2"], createdAt: now.toISOString() }
    ],
    listItems: [
      { id: "l1", text: "Oat milk", done: false },
      { id: "l2", text: "Dish soap", done: true }
    ],
    messages: [
      { id: "msg1", memberId: "m2", text: "I can do laundry after work.", createdAt: now.toISOString() }
    ],
    events: [
      { id: "cal1", title: "Trash pickup", date: now.toISOString().slice(0, 10) }
    ],
    standards: [
      { id: "s1", title: "Sunday kitchen close", cadence: "Weekly", done: false },
      { id: "s2", title: "Fridge shelf check", cadence: "Monthly", done: false }
    ],
    activity: [
      { id: "a1", text: "Household started a new weekly goal", createdAt: now.toISOString() }
    ]
  };
}

function clone(state) {
  return structuredClone(state);
}

function memberOrThrow(state, memberId) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member) throw new Error(`Unknown member ${memberId}`);
  return member;
}

export function normalizeWeek(state, now = new Date()) {
  const current = weekKey(now);
  if (state.household.weekKey === current) return state;
  const next = clone(state);
  next.household.weekKey = current;
  next.members.forEach((member) => { member.weeklyPoints = 0; });
  next.activity.unshift({
    id: crypto.randomUUID(),
    text: "Weekly points reset for a new household goal cycle",
    createdAt: now.toISOString()
  });
  return next;
}

export function completeTask(state, taskId, memberId, options = {}) {
  const now = options.completedAt ? new Date(options.completedAt) : new Date();
  const next = normalizeWeek(clone(state), now);
  const task = next.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Unknown task ${taskId}`);
  if (task.done) return next;
  const member = memberOrThrow(next, memberId);
  const base = Number(task.points) || 0;
  const bonus = options.focusActive ? Math.max(1, Math.round(base * 0.25)) : 0;
  const awarded = base + bonus;

  task.done = true;
  task.completedBy = memberId;
  task.completedAt = now.toISOString();
  member.points += awarded;
  member.weeklyPoints += awarded;
  next.completions.unshift({
    id: crypto.randomUUID(), taskId, memberId, basePoints: base, bonusPoints: bonus,
    points: awarded, completedAt: now.toISOString()
  });
  next.activity.unshift({
    id: crypto.randomUUID(),
    text: `${member.name} completed “${task.title}” for ${awarded} points${bonus ? ` (+${bonus} focus bonus)` : ""}`,
    createdAt: now.toISOString()
  });
  return next;
}

export function addTask(state, input) {
  const next = clone(state);
  memberOrThrow(next, input.assigneeId);
  next.tasks.unshift({
    id: crypto.randomUUID(),
    title: String(input.title || "").trim(),
    category: String(input.category || "Home").trim() || "Home",
    assigneeId: input.assigneeId,
    points: Math.max(1, Number(input.points) || 10),
    due: String(input.due || "Anytime"),
    done: false
  });
  return next;
}

export function addReward(state, input) {
  const next = clone(state);
  next.rewards.unshift({
    id: crypto.randomUUID(),
    title: String(input.title || "").trim(),
    cost: Math.max(1, Number(input.cost) || 50)
  });
  return next;
}

export function redeemReward(state, rewardId, memberId, now = new Date()) {
  const next = clone(state);
  const reward = next.rewards.find((item) => item.id === rewardId);
  if (!reward) throw new Error(`Unknown reward ${rewardId}`);
  const member = memberOrThrow(next, memberId);
  if (member.points < reward.cost) throw new Error("Not enough points");
  member.points -= reward.cost;
  next.redemptions.unshift({ id: crypto.randomUUID(), rewardId, memberId, cost: reward.cost, createdAt: now.toISOString() });
  next.activity.unshift({ id: crypto.randomUUID(), text: `${member.name} redeemed “${reward.title}”`, createdAt: now.toISOString() });
  return next;
}

export function addExpense(state, input, now = new Date()) {
  const next = clone(state);
  memberOrThrow(next, input.paidBy);
  const splitBetween = input.splitBetween?.length ? input.splitBetween : next.members.map((m) => m.id);
  splitBetween.forEach((id) => memberOrThrow(next, id));
  next.expenses.unshift({
    id: crypto.randomUUID(),
    title: String(input.title || "Expense").trim() || "Expense",
    amount: Math.max(0, Number(input.amount) || 0),
    paidBy: input.paidBy,
    splitBetween,
    createdAt: now.toISOString()
  });
  return next;
}

export function calculateBalances(state) {
  const balances = Object.fromEntries(state.members.map((member) => [member.id, 0]));
  for (const expense of state.expenses) {
    const split = expense.splitBetween?.length ? expense.splitBetween : state.members.map((m) => m.id);
    const share = expense.amount / split.length;
    balances[expense.paidBy] += expense.amount;
    for (const memberId of split) balances[memberId] -= share;
  }
  return balances;
}

export function calculateSettlements(state) {
  const balances = calculateBalances(state);
  const creditors = Object.entries(balances).filter(([, value]) => value > 0.005).map(([id, amount]) => ({ id, amount }));
  const debtors = Object.entries(balances).filter(([, value]) => value < -0.005).map(([id, amount]) => ({ id, amount: -amount }));
  const settlements = [];
  let c = 0;
  let d = 0;
  while (c < creditors.length && d < debtors.length) {
    const amount = Math.min(creditors[c].amount, debtors[d].amount);
    settlements.push({ from: debtors[d].id, to: creditors[c].id, amount: Math.round(amount * 100) / 100 });
    creditors[c].amount -= amount;
    debtors[d].amount -= amount;
    if (creditors[c].amount < 0.005) c += 1;
    if (debtors[d].amount < 0.005) d += 1;
  }
  return settlements;
}

export function householdWeeklyPoints(state) {
  return state.members.reduce((sum, member) => sum + member.weeklyPoints, 0);
}

export function leaderboard(state) {
  return [...state.members].sort((a, b) => b.weeklyPoints - a.weeklyPoints || a.name.localeCompare(b.name));
}

export function streakFor(state, memberId, now = new Date()) {
  const days = new Set(
    state.completions
      .filter((item) => item.memberId === memberId)
      .map((item) => item.completedAt.slice(0, 10))
  );
  let streak = 0;
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function ensureState(input) {
  if (!input || input.version !== VERSION || !Array.isArray(input.members) || !Array.isArray(input.tasks)) {
    throw new Error("Unsupported HomeQuest state");
  }
  return input;
}
