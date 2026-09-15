# Architecture

Agent Work OS is split into a small hosted control plane and a local runtime daemon.

```text
Browser UI
   |  REST + WebSocket
   v
Control Plane (Node 22)
   |  authenticated WebSocket
   v
Local Daemon
   |  adapter
   +--> Codex CLI (`codex exec --json`)
   +--> built-in echo adapter for deterministic verification
   v
Local repository / working directory
```

The control plane persists machine/session metadata in a JSON state file for the first vertical slice. Source code and agent credentials stay on the local machine. The daemon registers machine capabilities, sends heartbeats, receives session commands, launches an adapter, and streams normalized events back.

## Protocol

Protocol version: `1`.

Daemon -> server envelopes include `daemon.hello`, `daemon.heartbeat`, and `daemon.session.event`. Server -> daemon uses `server.command` with `session.start`, `session.message`, and `session.interrupt` actions. Browser clients receive `state.snapshot`, `machine.updated`, and `session.updated` events.

## Scaling path

The MVP deliberately keeps state and connection routing in one control-plane process. The next production phase should move durable state to Postgres and connection/event fan-out to Redis or NATS so multiple realtime gateways can run horizontally.
