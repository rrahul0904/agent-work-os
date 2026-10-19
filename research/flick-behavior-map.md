# Flick behavior map — clean-room observation target

Coordination issue: #262
Research date: 2026-10-16

This document records **publicly observable behavior only**. It is not a claim about Flick's internal implementation.

## Actor/device model

- mobile device
- desktop device
- paired trusted peer
- unpaired LAN peer
- shared desktop folder
- transfer job

Owned release scope: **iOS, macOS, Windows**.

## Flow 1 — first-time pairing

Public target behavior:
1. desktop opens and presents QR code;
2. phone scans once;
3. devices remember each other.

Owned contract:
1. desktop generates bounded pairing QR with protocol version, device ID, public-key fingerprint, ephemeral nonce and expiry;
2. iOS scans;
3. authenticated key agreement runs;
4. both screens show device names + short verification code;
5. both users approve;
6. long-lived peer identity and ACL record is stored securely;
7. later sessions authenticate against the pinned identity.

Negative cases:
- expired QR;
- replayed QR;
- key mismatch;
- same display name/different key;
- peer changes IP;
- one side rejects;
- interrupted pairing;
- local-network permission denied.

## Flow 2 — iOS → desktop quick send

Public target behavior:
- choose/share file on phone;
- flick/drag/send;
- file lands on desktop;
- progress/cancel available.

Owned contract:
- choose one or many files from app or Share Extension;
- select paired desktop/drop target;
- receiver authorization is evaluated;
- manifest sent before bytes;
- receiver preflights path/disk space/collision policy;
- chunks stream directly over LAN;
- progress/speed/ETA are observable;
- pause/cancel/retry are explicit states;
- final digest is verified;
- partial file becomes final atomically;
- receipt records exact outcome.

## Flow 3 — desktop → iOS quick send

Public target behavior:
- drag files onto desktop app;
- files arrive on phone.

Owned contract:
- drag/drop or context action selects items;
- paired iOS peer selected;
- receiver accepts according to per-peer policy;
- transferred item is saved through supported iOS Files/Photos destinations;
- if iOS goes to background, terminal state remains truthful (`continued`, `suspended`, `interrupted`, `failed`, `complete`).

## Flow 4 — drop into named desktop folder

Public target behavior:
- mobile can send directly to shared destinations such as Desktop/Downloads/Pictures/other configured folders.

Owned contract:
- desktop publishes opaque `share_id` + display label, never unrestricted absolute path;
- send permission can differ from browse/delete permissions;
- final path must remain inside canonical share root;
- collision policy is explicit (`ask`, `rename`, `replace` where authorized, `reject`).

Negative cases:
- `../` traversal;
- Unicode/path normalization collision;
- symlink/junction/reparse escape;
- reserved Windows names;
- path too long;
- read-only share;
- disk full;
- file already exists.

## Flow 5 — browse desktop folders from iOS

Public target behavior:
- browse selected shared folders;
- thumbnails/full-screen preview;
- search;
- download;
- rename/delete where permitted.

Owned contract:
- folder listing uses opaque relative paths beneath a share root;
- page results for very large folders;
- metadata and preview generation have byte/time/type limits;
- search is bounded to allowed roots;
- download uses the same verified transfer engine;
- rename/delete require stronger ACLs than list/read;
- delete defaults to Trash/Recycle Bin where supported;
- destructive actions produce receipts.

## Flow 6 — transfer interruption and resume

Public target behavior:
- current public material advertises progress/cancel; resume behavior is not established.

Owned improvement:
- transfer manifest has stable transfer/file IDs;
- receiver persists verified chunk/range state;
- reconnect re-authenticates peer;
- sender/receiver compare resume state;
- only missing ranges are retransmitted;
- final digest gates commit.

Negative cases:
- sender content changed before resume;
- receiver partial file changed;
- manifest mismatch;
- peer key changed;
- protocol version changed;
- insufficient disk after reconnect.

## Flow 7 — paired-device management

Owned contract:
- list paired devices;
- rename local display alias without changing cryptographic identity;
- edit permissions;
- revoke/unpair;
- inspect last-seen key fingerprint;
- re-pair after key rotation.

Revocation must immediately remove browse/write authority.

## Flow 8 — platform integrations

### iOS
- Share Extension;
- Files/Photos import/export;
- QR scanner;
- local-network permission UX;
- foreground/background transfer truth.

### macOS
- menu bar;
- start at login;
- drag/drop;
- Finder/share integrations later;
- explicit shared-folder picker.

### Windows
- tray/startup;
- drag/drop;
- Explorer integration later;
- firewall diagnostics;
- explicit shared-folder picker.

## State machine — transfer

Suggested canonical states:

`created -> awaiting_peer -> negotiating -> preflight -> transferring -> verifying -> committing -> complete`

Side states:

- `paused`
- `cancel_requested`
- `cancelled`
- `interrupted`
- `retrying`
- `failed`

Rules:
- `complete` only after digest verification + durable final-file commit;
- local UI closing is not equivalent to cancellation completion;
- sender success without receiver commit acknowledgement is not complete;
- retry/resume never changes the source file identity silently.

## Verification corpus

Minimum deterministic fixtures:
- 0-byte file;
- 1-byte file;
- small text/image/video;
- 1 GB and 5+ GB sparse/generated file;
- 10,000 tiny files;
- Unicode filenames;
- very long filename/path;
- duplicate filename;
- hidden file;
- symlink/junction/reparse fixture;
- malicious relative path attempts;
- changing source during transfer;
- low disk;
- Wi-Fi disconnect/reconnect;
- sleep/wake;
- IP address change;
- peer process crash/restart;
- corrupted chunk;
- stale pairing key.

## Product parity definition

Do not claim “Flick parity” from screenshots or happy-path demos. For this project, parity means each selected public behavior has:

1. a written behavior contract;
2. at least one positive fixture;
3. negative/recovery tests;
4. physical-device/platform verification where OS behavior matters;
5. a receipt or reproducible test artifact.

The owned product may intentionally differ when stronger security/reliability behavior is chosen.
