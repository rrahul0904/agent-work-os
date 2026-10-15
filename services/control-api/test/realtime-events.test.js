import assert from "node:assert/strict";
import test from "node:test";
import { createOpaqueCursorCodec, PostgresEventFanout } from "../src/realtime-events.js";

test("fan-out shutdown waits for in-flight event persistence and rejects later broadcasts", async () => {
  let eventId = 0;
  let enteredInsert;
  let releaseInsert;
  const insertEntered = new Promise((resolve) => { enteredInsert = resolve; });
  const insertGate = new Promise((resolve) => { releaseInsert = resolve; });
  const persisted = [];
  const pool = {
    async connect() {
      return {
        async query(sql, values = []) {
          if (sql.includes("INSERT INTO agent_work_os_realtime_events_v1")) {
            enteredInsert();
            await insertGate;
            eventId += 1;
            persisted.push(JSON.parse(values[2]));
            return { rows: [{ event_id: eventId }] };
          }
          return { rows: [] };
        },
        release() {}
      };
    }
  };
  const fanout = new PostgresEventFanout(pool, () => {}, { onError: () => {} });
  fanout.publish({ type: "test.before_shutdown" });
  await insertEntered;

  let closed = false;
  const closing = fanout.close().then(() => { closed = true; });
  fanout.publish({ type: "test.after_shutdown_started" });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(closed, false, "shutdown waits while an event transaction remains in flight");

  releaseInsert();
  await closing;
  assert.deepEqual(persisted, [{ type: "test.before_shutdown" }]);
  assert.equal(fanout.closed, true);
});

test("fan-out shutdown reports queued events when PostgreSQL remains unavailable", async () => {
  const errors = [];
  const pool = {
    async connect() {
      return {
        async query(sql) {
          if (sql === "BEGIN") throw new Error("database unavailable");
          return { rows: [] };
        },
        release() {}
      };
    }
  };
  const fanout = new PostgresEventFanout(pool, () => {}, {
    onError: (message) => errors.push(message),
    shutdownDrainTimeoutMs: 25
  });
  fanout.publish({ type: "test.database_unavailable" });
  await fanout.close();

  assert.equal(fanout.closed, true);
  assert.equal(fanout.publishQueue.length, 0);
  assert.ok(errors.some((message) => message.includes("shutdown deadline exceeded; dropping 1 unpersisted realtime event")));
});

test("fan-out bounds its queue and persists a marker that makes listeners refresh snapshots", async () => {
  let enteredInsert;
  let releaseInsert;
  const insertEntered = new Promise((resolve) => { enteredInsert = resolve; });
  const insertGate = new Promise((resolve) => { releaseInsert = resolve; });
  const persisted = [];
  const pool = {
    async connect() {
      return {
        async query(sql, values = []) {
          if (sql.includes("INSERT INTO agent_work_os_realtime_events_v1")) {
            if (!persisted.length) {
              enteredInsert();
              await insertGate;
            }
            persisted.push(JSON.parse(values[2]));
            return { rows: [{ event_id: persisted.length }] };
          }
          return { rows: [] };
        },
        release() {}
      };
    }
  };
  const errors = [];
  const fanout = new PostgresEventFanout(pool, () => {}, {
    onError: (message) => errors.push(message),
    maxQueuedEvents: 1
  });
  fanout.publish({ type: "test.first" });
  await insertEntered;
  fanout.publish({ type: "test.dropped_at_overflow" });
  assert.equal(fanout.publishQueue.length, 1, "the queue stays within its configured event limit");
  releaseInsert();
  await fanout.close();

  assert.deepEqual(persisted, [{ type: "test.first" }, { type: "realtime.resync_required" }]);
  assert.ok(errors.some((message) => message.includes("realtime event queue limit exceeded")));
});

test("cursor replay requests a snapshot when retained history contains a resync marker", async () => {
  const pool = {
    async connect() {
      return {
        async query(sql) {
          if (sql.includes("MIN(event_id)")) return { rows: [{ first_event_id: 5, last_event_id: 5 }] };
          if (sql.includes("last_value")) return { rows: [{ last_value: 5, is_called: true }] };
          if (sql.includes("SELECT event_id, event")) return { rows: [{ event_id: 5, event: { type: "realtime.resync_required" } }] };
          return { rows: [] };
        },
        release() {}
      };
    }
  };
  const fanout = new PostgresEventFanout(pool, () => {});
  assert.deepEqual(await fanout.replayAfter(4), { gap: true });
});

test("opaque event cursors are authenticated and do not reveal sequence values", () => {
  const codec = createOpaqueCursorCodec("stable-multi-instance-secret");
  for (const sequence of [0, 9]) assert.equal(codec.decode(codec.encode(sequence)), sequence);
  const cursor = codec.encode(123456);
  assert.notEqual(cursor, "123456");
  assert.equal(codec.decode(cursor), 123456);
  assert.equal(codec.decode(`${cursor[0] === "A" ? "B" : "A"}${cursor.slice(1)}`), null, "tampered cursors are rejected");
  assert.notEqual(codec.eventTag(123456), "123456");
  assert.equal(codec.eventTag(123456), codec.eventTag(123456), "event tags are stable for duplicate detection");
  assert.notEqual(codec.decode(createOpaqueCursorCodec("another-secret").encode(123456)), 123456);
});
