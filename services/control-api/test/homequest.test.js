import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBalances,
  calculateSettlements,
  completeTask,
  createSeedState,
  householdWeeklyPoints,
  redeemReward,
  streakFor,
  weekKey
} from "../../../apps/web/public/homequest/core.js";

test("task completion awards base points and focus bonus", () => {
  let state = createSeedState(new Date("2026-10-14T12:00:00Z"));
  state = completeTask(state, "t1", "m1", { focusActive: true, completedAt: "2026-10-14T12:01:00Z" });
  const alex = state.members.find((m) => m.id === "m1");
  assert.equal(alex.points, 165);
  assert.equal(alex.weeklyPoints, 120);
  assert.equal(state.completions[0].bonusPoints, 5);
  assert.equal(householdWeeklyPoints(state), 200);
});

test("reward redemption debits only spendable points", () => {
  let state = createSeedState(new Date("2026-10-14T12:00:00Z"));
  state = redeemReward(state, "r1", "m1", new Date("2026-10-14T12:05:00Z"));
  const alex = state.members.find((m) => m.id === "m1");
  assert.equal(alex.points, 20);
  assert.equal(alex.weeklyPoints, 95);
  assert.equal(state.redemptions.length, 1);
});

test("shared expense ledger derives an exact two-person settlement", () => {
  const state = createSeedState(new Date("2026-10-14T12:00:00Z"));
  assert.deepEqual(calculateBalances(state), { m1: 32.25, m2: -32.25 });
  assert.deepEqual(calculateSettlements(state), [{ from: "m2", to: "m1", amount: 32.25 }]);
});

test("streak counts consecutive completion dates", () => {
  let state = createSeedState(new Date("2026-10-14T12:00:00Z"));
  state.completions = [
    { memberId: "m1", completedAt: "2026-10-14T08:00:00Z" },
    { memberId: "m1", completedAt: "2026-10-13T08:00:00Z" },
    { memberId: "m1", completedAt: "2026-10-12T08:00:00Z" }
  ];
  assert.equal(streakFor(state, "m1", new Date("2026-10-14T20:00:00Z")), 3);
});

test("week key is stable for ISO week boundaries", () => {
  assert.equal(weekKey(new Date("2026-10-14T00:00:00Z")), "2026-W42");
});
