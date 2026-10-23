# Bridge ↔ OBDLink connection: root cause and design

2026-10-22. Covers `files/firmware/uno-q-bridge/obd_tcp_bridge.py`, `files/src/main/tcpPort.ts`,
`files/src/main/main.ts` and `files/src/main/autoConnect.ts`.

## 1. The log, line by line

| Time | Line | Produced by |
|---|---|---|
| 22:05:29.531 | `[ELM327] Starting ELM327 initialization sequence` | `src/core/elm327Commander.ts` `initialize()`, called from `connectToPort()` in `src/main/main.ts` once `TcpPort.open()` reports the TCP connection up |
| 22:05:29.540 | `RX 66B: "BRIDGE ERROR: cannot open /dev/rfcomm0: No such file or directory\r"` | Bridge `attach()` → `open_serial("/dev/rfcomm0")` raises `ENOENT`; the bridge sends the line, half-closes, drains. Logged by the RX hook in `connectToPort()` |
| 22:05:29.542 | `Serial port closed` | `TcpPort` emits `close`; `port.on('close')` in `connectToPort()` |
| 22:05:29.542 | `Connection failed: The bridge can't reach the OBD adapter: … [BRIDGE ERROR]` | Same handler: init never finished, so `setupFailureReason(port)` reads `TcpPort.closeReason` |

The error arrives 9 ms after init starts. That is an instant `ENOENT`, not a timeout, so this is not a race with a slow device.

## 2. Root cause

**Nothing creates `/dev/rfcomm0`.** The bridge opens it as if it always exists (`--device /dev/rfcomm0` in
`tattlestone-bridge.service`, opened in `attach()`). The node only exists after a root-run
`rfcomm bind 0 <MAC> 1`. No unit, udev rule or script in the repo runs that, and the manual attempt
failed because the placeholder `<OBDLink-MAC>` was typed literally. Even when it is done by hand, a bind
is lost at every reboot.

The underlying design flaw: the bridge depends on a device node that a different, privileged actor has to create, outside the
service's lifecycle. It can't create the node itself (it runs as `arduino`, and `rfcomm bind` needs
`CAP_NET_ADMIN`), and it can't tell the user which part is missing.

Other candidates from the checklist:

- **Torn down too early / stale state:** no. The bridge closes the device and client on every
  exit path (`detach()`), and newest-client-wins stops a dead session from blocking.
- **App/bridge race:** no. The device never exists, and the failure is immediate.
- **Paired / trusted / in range / MAC / channel:** not verifiable from here (no SSH key for the board).
  The board has never had a working bind, so pairing is unconfirmed. The new design reports each of these
  as a separate, actionable error.

## 3. Design

### The bridge owns the Bluetooth link

The bridge opens an **RFCOMM socket** directly (`AF_BLUETOOTH`, `BTPROTO_RFCOMM`, Python stdlib on
Linux), with no `/dev/rfcomm0` and no `rfcomm bind`:

- A normal user can do it, so no root and no extra unit.
- The link exists exactly as long as the socket. Closing it drops the Bluetooth connection, so nothing stale
  is left behind.
- `--bt auto` (the default) finds the paired adapter with `bluetoothctl devices Paired` (name matching
  OBDLink/OBD/ELM327). `--bt 00:04:3E:…` pins a MAC, and `--channel` sets the RFCOMM channel (default 1).
- `--device /dev/ttyUSB0` still selects a USB serial adapter.

**One-time setup that stays manual:** pairing (`bluetoothctl pair`/`trust`). It needs someone at the
adapter (button or PIN), and the bridge's error message says exactly how to do it.

### Bridge ↔ app handshake (in-band, before any adapter traffic)

```
BRIDGE STATUS: <progress>\r     zero or more; shown to the user
BRIDGE READY\r                  link up: ELM327 traffic follows
BRIDGE ERROR: <what to do>\r    then the bridge closes the connection
```

A plain Wi-Fi ELM327 dongle sends nothing. If no `BRIDGE` line arrives within 1.5 s, `TcpPort` treats
the peer as a dongle and opens. The bridge sends its first `STATUS` line the moment it accepts.

### Bridge per-client state machine

```
LISTENING ──accept──▶ LINKING ──link up──▶ FORWARDING
    ▲                  │  │                    │
    │      deadline /  │  │ app gone /         │ app EOF · adapter EOF/error ·
    │  not retryable   │  │ newer client       │ newer client · SIGTERM
    │  (BRIDGE ERROR)  ▼  ▼                    ▼
    └────────────────── CLOSING ◀──────────────┘
                 close adapter link, then client
```

- **LINKING:** attempts at 0, 1, 2, 4, 4, … s until a 20 s deadline. Each attempt is bounded at 6 s.
  Between attempts it sends `BRIDGE STATUS: … retrying in Ns (attempt n)` and waits on the client and the
  listening socket, so an app that leaves or a newer client ends the wait at once. Bytes the app sends
  during LINKING are dropped (the app sends nothing before `READY`).
- **Non-retryable errors** (no paired adapter, no Bluetooth support, permission) fail at once.

### App connection state machine (Network mode)

```
IDLE ─open window (remembered bridge) / Connect─▶ CONNECTING (TCP)
CONNECTING ─TCP up─▶ LINKING (shows BRIDGE STATUS text)
CONNECTING ─refused/unreachable─▶ auto-connect: RETRY WAIT (3 s, then 10 s) ─▶ CONNECTING
                                  manual connect: ERROR
LINKING ─BRIDGE READY / silent 1.5 s (dongle)─▶ INITIALIZING (ELM327 init) ─▶ CONNECTED
LINKING ─BRIDGE ERROR / 30 s timeout─▶ ERROR (the bridge already retried; the app does not)
CONNECTED ─link closed (bridge reason in closeReason) / link-lost─▶ ERROR
any ─Disconnect / window closed / quit─▶ TEARDOWN ─▶ IDLE
```

- **Connect on open:** after a successful Network connection the target is saved to
  `userData/connection.json`. When a window finishes loading, the app reconnects to it (skipped if a
  session is already up). A manual **Disconnect** clears it, so the app stops auto-connecting.
- Any manual connect or disconnect cancels a pending auto-connect retry.

### Shutdown order

1. **App:** `endSession()` stops polling and the OBD manager.
2. **App:** `ELM327Commander.close()` resolves the pending and queued commands as `Closed`; nothing more is written.
3. **App:** `TcpPort.close()` destroys the socket (FIN).
4. **Bridge:** sees EOF, closes the RFCOMM socket (Bluetooth DISC), closes the client, returns to LISTENING.

Abrupt app kill: the OS closes the socket, and the flow continues from step 4. Mac asleep or off Wi-Fi: TCP keepalive (about 25 s) or the next
connection (newest client wins) retires the old session. `systemctl stop`: SIGTERM → close link → close
client.

## 4. Review findings (all addressed in the implementation)

| Sev | Finding | Resolution |
|---|---|---|
| High | A `BRIDGE ERROR` during the handshake fails `open()`, then the socket's `close` would also fire. That reports the failure twice and races the catch block | `TcpPort` emits `close`/`error` only after a successful open |
| High | Auto-connect could race a manual connect or disconnect and reopen a session the user closed | Every manual connect/disconnect bumps a counter; auto-connect stops when it changes, and skips if a session is up or connecting |
| High | The single-threaded bridge can't watch the app while blocked in a Bluetooth `connect()` | Each attempt is bounded at 6 s; between attempts it waits on the app and the listener, so a leaving app or newer client is noticed within one attempt |
| Med | A failed connect attempt could leak the RFCOMM socket fd | The socket is closed on every failed attempt |
| Med | `bluetoothctl` can hang | `timeout=5` on the subprocess; falls back to `paired-devices` on older BlueZ |
| Med | `BRIDGE` lines split across TCP reads | `TcpPort` line-buffers during the handshake |
| Med | A mid-session `BRIDGE ERROR` (Bluetooth drop) falls outside the 256-byte head buffer | `closeReason` also checks a 256-byte tail |
| Med | A remembered address that no longer works would retry forever | Retries are bounded (3 attempts); a manual Disconnect forgets it |
| Low | Quit doesn't await `endSession()` | The OS closes the socket at exit; the bridge handles EOF (step 4 above) |
| Low | A plain dongle is misdetected if a bridge's greeting takes over 1.5 s | The bridge greets on accept, before any Bluetooth work; only a ≥1.5 s Wi-Fi RTT could trigger it |

## 5. Verification

- **Bridge (Python, no hardware; the Bluetooth connector is injected):**
  - handshake and round trip
  - retry then success
  - deadline gives an actionable error, and later clients are still served
  - an app that leaves during LINKING stops the retries
  - a clean close releases the link, and a reconnect gets a fresh link
  - an adapter drop gives `BRIDGE ERROR` and a close
  - MAC discovery parsing
  - no paired adapter
- **App (node:test):**
  - `TcpPort` handshake: status events, READY, ERROR (no `close`), silent dongle, split lines, tail reason
  - `connectWithRetry`: retry schedule, cancellation, non-retryable stop
- **Hardware** (`obdlink-bind-next-steps.html`):
  - pair once, deploy, restart the bridge
  - open the app: it connects with no manual commands
  - quit: the journal shows the link closed, and `hcitool con` shows no connection
  - reopen: it connects again
