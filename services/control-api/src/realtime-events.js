import crypto from "node:crypto";

const CHANNEL = "agent_work_os_realtime_events_v1";
const WRITE_LOCK = "agent_work_os_realtime_events_v1_write";

export class PostgresEventFanout {
  constructor(pool, onEvent, {
    onError = console.warn,
    onGap = () => {},
    shutdownDrainTimeoutMs = 20_000,
    maxQueuedEvents = 10_000,
    maxQueueBytes = 64 * 1024 * 1024
  } = {}) {
    this.pool = pool;
    this.onEvent = onEvent;
    this.onError = onError;
    this.onGap = onGap;
    this.shutdownDrainTimeoutMs = shutdownDrainTimeoutMs;
    this.maxQueuedEvents = maxQueuedEvents;
    this.maxQueueBytes = maxQueueBytes;
    this.instanceId = crypto.randomUUID();
    this.lastEventId = null;
    this.listener = null;
    this.closed = false;
    this.closing = false;
    this.ready = false;
    this.draining = false;
    this.pendingDrain = false;
    this.retryTimer = null;
    this.publishQueue = [];
    this.publishQueueBytes = 0;
    this.overflowed = false;
    this.publishing = false;
    this.publishIdle = Promise.resolve();
    this.publishRetryTimer = null;
    this.retentionTimer = null;
  }

  async start() {
    await this.#pruneExpired();
    this.retentionTimer = setInterval(() => void this.#pruneExpired(), 60 * 60 * 1000);
    this.retentionTimer.unref?.();
    await this.#connectListener();
  }

  publish(event) {
    if (this.closing || this.closed) return;
    if (this.overflowed) return;
    const copy = structuredClone(event);
    const serializedEvent = JSON.stringify(copy);
    const eventBytes = Buffer.byteLength(serializedEvent);
    if (this.publishQueue.length >= this.maxQueuedEvents || this.publishQueueBytes + eventBytes > this.maxQueueBytes) {
      this.overflowed = true;
      this.ready = false;
      this.onError("[api] realtime event queue limit exceeded; broadcasts are paused until listeners receive a resync marker");
      void this.#flushPublishQueue();
      return;
    }
    this.publishQueue.push({ eventKey: crypto.randomUUID(), event: copy, serializedEvent, eventBytes });
    this.publishQueueBytes += eventBytes;
    this.ready = false;
    void this.#flushPublishQueue();
  }

  async #persist({ eventKey, event, serializedEvent }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [WRITE_LOCK]);
      const inserted = await client.query(
        `INSERT INTO agent_work_os_realtime_events_v1 (event_key, origin_id, event)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
         RETURNING event_id`,
        [eventKey, this.instanceId, serializedEvent ?? JSON.stringify(event)]
      );
      await client.query("SELECT pg_notify($1, $2)", [CHANNEL, String(inserted.rows[0].event_id)]);
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    this.closing = true;
    this.ready = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.retentionTimer) clearInterval(this.retentionTimer);
    this.retentionTimer = null;
    // The API stops accepting work before this is called. Keep retrying queued
    // events until they are persisted, then release the listener connection.
    const deadline = Date.now() + this.shutdownDrainTimeoutMs;
    while (this.publishQueue.length && Date.now() < deadline) {
      if (this.publishRetryTimer) {
        clearTimeout(this.publishRetryTimer);
        this.publishRetryTimer = null;
      }
      if (this.publishing) {
        const remainingMs = Math.max(1, deadline - Date.now());
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, remainingMs);
          this.publishIdle.then(() => { clearTimeout(timer); resolve(); });
        });
        if (this.publishing) break;
      } else await this.#flushPublishQueue();
      if (this.publishQueue.length) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, Math.max(1, deadline - Date.now()))));
      }
    }
    if (this.publishQueue.length) {
      this.onError(`[api] shutdown deadline exceeded; dropping ${this.publishQueue.length} unpersisted realtime event(s)`);
      this.publishQueue.length = 0;
      this.publishQueueBytes = 0;
    }
    this.closed = true;
    if (this.publishRetryTimer) clearTimeout(this.publishRetryTimer);
    this.publishRetryTimer = null;
    const listener = this.listener;
    this.listener = null;
    if (listener) {
      try { await listener.query(`UNLISTEN ${CHANNEL}`); } catch {}
      listener.release();
    }
  }

  async #pruneExpired() {
    try {
      await this.pool.query("DELETE FROM agent_work_os_realtime_events_v1 WHERE created_at < clock_timestamp() - INTERVAL '7 days'");
    } catch (error) {
      this.onError("[api] realtime event retention cleanup failed", error.message);
    }
  }

  async #flushPublishQueue() {
    if (this.publishing || this.closed) return;
    this.publishing = true;
    let markIdle;
    this.publishIdle = new Promise((resolve) => { markIdle = resolve; });
    try {
      while (!this.closed) {
        if (!this.publishQueue.length && this.overflowed) {
          const event = { type: "realtime.resync_required" };
          const serializedEvent = JSON.stringify(event);
          const eventBytes = Buffer.byteLength(serializedEvent);
          this.publishQueue.push({ eventKey: crypto.randomUUID(), event, serializedEvent, eventBytes });
          this.publishQueueBytes += eventBytes;
          this.overflowed = false;
        }
        if (!this.publishQueue.length) break;
        try {
          await this.#persist(this.publishQueue[0]);
          const persisted = this.publishQueue.shift();
          this.publishQueueBytes -= persisted.eventBytes;
        } catch (error) {
          this.onError("[api] realtime event publish failed; queued for retry", error.message);
          this.#schedulePublishRetry();
          break;
        }
      }
    } finally {
      this.publishing = false;
      markIdle();
      this.ready = Boolean(!this.closing && this.listener && !this.publishQueue.length);
      if (this.publishQueue.length && !this.publishRetryTimer) this.#schedulePublishRetry();
    }
  }

  #schedulePublishRetry() {
    if (this.closed || this.publishRetryTimer) return;
    this.publishRetryTimer = setTimeout(() => {
      this.publishRetryTimer = null;
      void this.#flushPublishQueue();
    }, 1_000);
    this.publishRetryTimer.unref?.();
  }

  async #connectListener() {
    if (this.closed || this.listener) return;
    let client;
    try {
      client = await this.pool.connect();
      client.on("notification", (message) => {
        if (message.channel === CHANNEL) void this.#drain();
      });
      client.on("error", (error) => this.#listenerFailed(client, error));
      await client.query(`LISTEN ${CHANNEL}`);
      this.listener = client;
      if (this.lastEventId === null) {
        // Clients cannot be connected until start() returns, so begin at the
        // sequence high-water mark and only deliver events committed later.
        this.lastEventId = await this.#sequenceHighWater();
      } else {
        await this.#drain();
      }
      this.ready = Boolean(!this.publishQueue.length);
    } catch (error) {
      if (client === this.listener) this.listener = null;
      if (client) client.release(true);
      this.onError("[api] realtime event listener unavailable", error.message);
      this.#scheduleReconnect();
      throw error;
    }
  }

  #listenerFailed(client, error) {
    if (this.listener !== client) return;
    this.listener = null;
    this.ready = false;
    client.release(true);
    this.onError("[api] realtime event listener disconnected", error.message);
    this.#scheduleReconnect();
  }

  #scheduleReconnect() {
    if (this.closing || this.closed || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.#connectListener().catch(() => {});
    }, 1_000);
    this.retryTimer.unref?.();
  }

  async #drain() {
    if (this.draining) {
      this.pendingDrain = true;
      return;
    }
    if (this.lastEventId === null || this.closed) return;
    this.draining = true;
    try {
      while (!this.closed) {
        const bounds = await this.pool.query(
          "SELECT COALESCE(MIN(event_id), 0) AS first_event_id, COALESCE(MAX(event_id), 0) AS last_event_id FROM agent_work_os_realtime_events_v1"
        );
        const firstEventId = Number(bounds.rows[0].first_event_id);
        const latestEventId = Number(bounds.rows[0].last_event_id);
        const sequenceHighWater = await this.#sequenceHighWater();
        const result = await this.pool.query(
          "SELECT event_id, origin_id, event FROM agent_work_os_realtime_events_v1 WHERE event_id > $1 ORDER BY event_id LIMIT 500",
          [this.lastEventId]
        );
        if (firstEventId && this.lastEventId < firstEventId - 1) {
          this.lastEventId = latestEventId;
          this.onGap();
          break;
        }
        // Retention may remove the entire table. The sequence retains evidence
        // that event IDs existed, even when no rows remain to expose the gap.
        if (!result.rows.length) {
          if (this.lastEventId < sequenceHighWater) {
            this.lastEventId = sequenceHighWater;
            this.onGap();
          }
          break;
        }
        for (const row of result.rows) {
          this.lastEventId = Number(row.event_id);
          if (row.event?.type === "realtime.resync_required") this.onGap();
          else this.onEvent(row.event);
        }
      }
    } catch (error) {
      this.onError("[api] realtime event delivery failed", error.message);
    } finally {
      this.draining = false;
      if (this.pendingDrain && !this.closed) {
        this.pendingDrain = false;
        void this.#drain();
      }
    }
  }

  async #sequenceHighWater() {
    const result = await this.pool.query("SELECT last_value, is_called FROM agent_work_os_realtime_events_v1_event_id_seq");
    return result.rows[0].is_called ? Number(result.rows[0].last_value) : 0;
  }

}
