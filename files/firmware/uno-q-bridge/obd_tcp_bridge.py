#!/usr/bin/env python3
"""Tattlestone Network Mode bridge for the Arduino UNO Q (Linux side).

Forwards bytes between one TCP client (the Tattlestone app) and an OBD adapter:
the OBDLink MX over a Bluetooth RFCOMM socket the bridge opens itself (no
/dev/rfcomm0, no `rfcomm bind`), or a USB STN1110/ELM327 serial device.

Before any adapter traffic the bridge tells the app how the link is going:
    BRIDGE STATUS: <progress>\\r     zero or more
    BRIDGE READY\\r                  link up; ELM327 traffic follows
    BRIDGE ERROR: <what to do>\\r    then the bridge closes the connection

With a pairing token configured, the app must prove it holds the token before
anything else happens (HMAC-SHA256 over a fresh nonce; the token itself never
crosses the network):
    BRIDGE AUTH <nonce>\r            bridge -> app, on connect
    AUTH <hex hmac>\r                app -> bridge, within AUTH_TIMEOUT_S
A client that fails or stays silent is refused, and the session in progress
is untouched. Only an authenticated client can replace the current one.

App -> adapter traffic is checked line by line against command_policy.json,
the same read-only allowlist the app enforces (an identical copy of
src/shared/command-policy.json). A refused or over-long line gets the
ELM327's "?" and is never forwarded, so the read-only promise holds for any
client, not only the app.

Stdlib only (no pyserial, no pybluez):
    python3 obd_tcp_bridge.py --new-token /etc/tattlestone/bridge-token   # once
    python3 obd_tcp_bridge.py --bt auto --port 35000          # paired OBDLink
    python3 obd_tcp_bridge.py --device /dev/ttyUSB0 --baud 115200
Settings also come from the environment: TATTLESTONE_BRIDGE_HOST, _PORT,
_TOKEN_FILE and _TOKEN (systemd reads them from /etc/default/tattlestone-bridge).
"""
import argparse
import errno
import hashlib
import hmac
import json
import os
import re
import secrets
import select
import signal
import socket
import subprocess
import termios
import time
import tty

BAUDS = {9600: termios.B9600, 38400: termios.B38400, 115200: termios.B115200}

LINK_DEADLINE_S = 20          # keep trying the adapter this long per client
BT_CONNECT_TIMEOUT_S = 6      # one attempt; also bounds how long the loop is blind
BACKOFF_S = (1, 2, 4)         # waits between attempts, the last one repeating
OBD_NAME = re.compile(r"obdlink|obd|elm327|vlink|vgate", re.I)

HERE = os.path.dirname(os.path.abspath(__file__))
POLICY_FILE = os.path.join(HERE, "command_policy.json")
DEFAULT_TOKEN_FILE = "/etc/tattlestone/bridge-token"
MIN_TOKEN_LEN = 16
AUTH_TIMEOUT_S = 5            # an unauthenticated client gets this long to answer
MAX_PENDING = 4               # unauthenticated clients waiting at once; more are refused
NOT_UNDERSTOOD = b"?\r\r>"     # an ELM327's answer to a command it won't run


class AdapterUnavailable(Exception):
    """The adapter can't be opened. `message` tells the user what to do;
    `short` is the one-line reason used in retry status lines."""

    def __init__(self, message: str, retryable: bool, short: str = ""):
        super().__init__(message)
        self.message = message
        self.retryable = retryable
        self.short = short or message


# ── USB serial adapters ──────────────────────────────────────────────────────

class SerialLink:
    """A raw serial fd with the socket methods the forwarding loop uses."""

    def __init__(self, fd: int):
        self.fd = fd

    def fileno(self) -> int:
        return self.fd

    def recv(self, n: int) -> bytes:
        return os.read(self.fd, n)

    def sendall(self, data: bytes) -> None:
        while data:
            data = data[os.write(self.fd, data):]

    def close(self) -> None:
        os.close(self.fd)


def open_serial(path: str, baud: int) -> SerialLink:
    fd = os.open(path, os.O_RDWR | os.O_NOCTTY)
    tty.setraw(fd)
    attrs = termios.tcgetattr(fd)
    attrs[4] = attrs[5] = BAUDS[baud]          # ispeed, ospeed
    attrs[2] |= termios.CLOCAL | termios.CREAD  # ignore modem lines
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    return SerialLink(fd)


def serial_opener(device: str, baud: int):
    def open_adapter():
        try:
            return open_serial(device, baud)
        except OSError as e:
            hint = ""
            if device.startswith("/dev/rfcomm"):
                hint = " The bridge now opens Bluetooth itself: run it with --bt auto instead of --device."
            elif e.errno == errno.ENOENT:
                hint = " Check the USB cable, then ls /dev/ttyUSB* /dev/ttyACM* for the right name."
            elif e.errno in (errno.EACCES, errno.EPERM):
                hint = " Add the bridge's user to the dialout group."
            raise AdapterUnavailable(f"cannot open {device}: {e.strerror}.{hint}", retryable=False)
    return open_adapter


# ── Bluetooth (RFCOMM socket) ────────────────────────────────────────────────

PAIRING_HELP = ("pair it once on the board: run bluetoothctl, then power on, agent on, scan on; when the "
                "OBDLink appears, pair ADDRESS and trust ADDRESS (PIN 1234), then quit")


def find_paired_obd(run=subprocess.run):
    """MAC of the first paired device whose name looks like an OBD adapter, or None."""
    # `devices Paired` is BlueZ >= 5.65; older releases have `paired-devices`
    for args in (["bluetoothctl", "devices", "Paired"], ["bluetoothctl", "paired-devices"]):
        try:
            out = run(args, capture_output=True, text=True, timeout=5).stdout
        except (OSError, subprocess.SubprocessError):
            continue
        for line in out.splitlines():
            m = re.match(r"Device ((?:[0-9A-F]{2}:){5}[0-9A-F]{2}) (.*)", line.strip(), re.I)
            if m and OBD_NAME.search(m.group(2)):
                return m.group(1).upper()
    return None


def bt_connect(mac: str, channel: int, timeout: float = BT_CONNECT_TIMEOUT_S) -> socket.socket:
    if not hasattr(socket, "AF_BLUETOOTH"):
        raise OSError(errno.EAFNOSUPPORT, "this Python has no Bluetooth socket support")
    s = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)
    try:
        s.settimeout(timeout)
        s.connect((mac, channel))
    except BaseException:
        s.close()  # a failed attempt must not leak the fd
        raise
    s.settimeout(5)  # sendall to a stalled adapter must not freeze the one loop
    return s


def describe_bt_error(e: OSError, mac: str, channel: int) -> AdapterUnavailable:
    code = e.errno
    if isinstance(e, socket.timeout) or code in (errno.EHOSTDOWN, errno.EHOSTUNREACH, errno.ETIMEDOUT):
        return AdapterUnavailable(
            f"the OBDLink ({mac}) is not answering over Bluetooth: turn the ignition on, keep the board within "
            "a few metres of the truck, and disconnect any phone or Mac that is connected to the OBDLink",
            retryable=True, short=f"OBDLink {mac} not answering")
    if code == errno.ECONNREFUSED:
        return AdapterUnavailable(
            f"the OBDLink ({mac}) refused RFCOMM channel {channel}: check the channel with "
            f"sdptool browse {mac} and pass --channel, or power-cycle the adapter",
            retryable=True, short=f"OBDLink {mac} refused channel {channel}")
    if code in (errno.EBUSY, errno.EALREADY, errno.EADDRINUSE, errno.EISCONN):
        return AdapterUnavailable(
            f"Bluetooth on the board is already connected to the OBDLink ({mac}) by something else, often "
            "a leftover rfcomm session: run sudo rfcomm release all",
            retryable=True, short="OBDLink busy with another connection")
    if code in (errno.EACCES, errno.EPERM):
        return AdapterUnavailable(
            "permission denied opening a Bluetooth socket: run the bridge as a user in the bluetooth group",
            retryable=False)
    if code == errno.EAFNOSUPPORT:
        return AdapterUnavailable(f"{e.strerror}: run the bridge with the system python3 on the board",
                                  retryable=False)
    return AdapterUnavailable(f"Bluetooth connect to the OBDLink ({mac}) failed: {e}", retryable=True,
                              short=f"Bluetooth error: {e}")


def bt_opener(mac: str, channel: int, find=find_paired_obd, connect=bt_connect):
    """`mac` is an address or 'auto' (looked up on every attempt, so pairing
    while the app waits is picked up)."""
    def open_adapter():
        target = find() if mac == "auto" else mac
        if not target:
            raise AdapterUnavailable(
                f"no paired OBDLink on this board: {PAIRING_HELP}. If it is already paired, the bridge can't "
                "read the pairing list: add its user to the bluetooth group, or run it with --bt ADDRESS",
                retryable=False)
        try:
            return connect(target, channel)
        except OSError as e:
            raise describe_bt_error(e, target, channel) from e
    return open_adapter


# ── App side ─────────────────────────────────────────────────────────────────

class AdapterLost(Exception):
    """The adapter side of a forwarding session failed (Bluetooth drop, unplugged)."""


def adapter_read(link) -> bytes:
    try:
        out = link.recv(512)
    except OSError as e:
        raise AdapterLost(str(e)) from e
    if not out:
        raise AdapterLost("the adapter closed the link")
    return out


def adapter_write(link, data: bytes) -> None:
    try:
        link.sendall(data)
    except OSError as e:
        raise AdapterLost(str(e)) from e


# ── Read-only command policy ─────────────────────────────────────────────────

def load_policy(path: str = POLICY_FILE) -> dict:
    """The shared allowlist. Missing or unreadable means the bridge won't start:
    forwarding unchecked would be worse than not forwarding at all."""
    try:
        with open(path) as f:
            policy = json.load(f)
        if not all(isinstance(policy.get(k), t) for k, t in
                   (("maxLineLength", int), ("readServices", dict), ("atDenyPrefixes", dict), ("stAllow", list))):
            raise ValueError("missing or malformed keys")
        return policy
    except (OSError, ValueError) as e:
        raise SystemExit(f"cannot load the command policy {path}: {e}. Copy command_policy.json next to the bridge.")


def refusal_reason(line: bytes, policy: dict):
    """Why `line` (one command, without its CR) must not reach the adapter, or
    None. Mirrors refusalReason() in src/shared/commandPolicy.ts."""
    if b"\r" in line or b"\n" in line:
        return "line break inside a command"
    if len(line) > policy["maxLineLength"]:
        return f"longer than {policy['maxLineLength']} characters"
    if any((b < 0x20 and b != 0x09) or b > 0x7E for b in line):
        return "non-printable character"
    cmd = re.sub(rb"[ \t]+", b"", line).decode("ascii").upper()
    if not cmd:
        return None  # a bare CR repeats the adapter's last command, which passed this check
    if cmd.startswith("AT"):
        for prefix, why in policy["atDenyPrefixes"].items():
            if cmd.startswith(prefix):
                return f"{prefix}: {why}"
        return None
    if cmd.startswith("ST"):
        return None if cmd in policy["stAllow"] else f"{cmd[:8]}: not an adapter identification command"
    if not re.fullmatch(r"(?:[0-9A-F]{2})+", cmd):
        return "not an AT, ST or hex request"
    return None if cmd[:2] in policy["readServices"] else f"service {cmd[:2]} is not a read"


# ── Pairing token ────────────────────────────────────────────────────────────

def auth_response(token: str, nonce: str) -> str:
    return hmac.new(token.encode(), nonce.encode(), hashlib.sha256).hexdigest()


def read_token_file(path: str) -> str:
    try:
        with open(path) as f:
            token = f.read().strip()
    except OSError as e:
        raise SystemExit(f"cannot read the pairing token {path}: {e.strerror}. Create one with --new-token {path}")
    if len(token) < MIN_TOKEN_LEN:
        raise SystemExit(f"the pairing token in {path} is shorter than {MIN_TOKEN_LEN} characters")
    return token


def write_new_token(path: str) -> str:
    token = secrets.token_urlsafe(24)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o640)
    with os.fdopen(fd, "w") as f:
        f.write(token + "\n")
    os.chmod(path, 0o640)  # O_CREAT's mode only applies to a new file
    return token


def resolve_token(token_file, env=os.environ):
    """The pairing token, or None to run without one. A token file that was asked
    for but can't be read stops the bridge instead of opening it up."""
    if env.get("TATTLESTONE_BRIDGE_TOKEN"):
        token = env["TATTLESTONE_BRIDGE_TOKEN"].strip()
        if len(token) < MIN_TOKEN_LEN:
            raise SystemExit(f"TATTLESTONE_BRIDGE_TOKEN is shorter than {MIN_TOKEN_LEN} characters")
        return token
    if token_file:
        return read_token_file(token_file)
    if os.path.exists(DEFAULT_TOKEN_FILE):
        return read_token_file(DEFAULT_TOKEN_FILE)
    return None


def say(client: socket.socket, line: str) -> None:
    client.sendall(line.encode("ascii", "replace") + b"\r")


def tune_client(client: socket.socket) -> None:
    client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    # A Mac that sleeps or leaves Wi-Fi sends no FIN; keepalive retires the
    # half-open socket instead of the bridge holding it forever.
    client.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
    for opt, val in (("TCP_KEEPIDLE", 10), ("TCP_KEEPINTVL", 5), ("TCP_KEEPCNT", 3)):
        if hasattr(socket, opt):
            client.setsockopt(socket.IPPROTO_TCP, getattr(socket, opt), val)
    # sendall to a peer that stopped reading must not stall the one loop
    client.settimeout(5)


def refuse(client: socket.socket, reason: str) -> None:
    """Tell the app why, then close without losing the message."""
    try:
        # No '>' prompt: this is not an adapter reply
        say(client, f"BRIDGE ERROR: {reason}")
        # Closing with the app's bytes still unread would send RST and
        # discard the message: FIN first, then drain until the app closes.
        client.shutdown(socket.SHUT_WR)
        client.settimeout(1)
        deadline = time.monotonic() + 1  # bounded: this blocks the one loop
        while time.monotonic() < deadline and client.recv(512):
            pass
    except OSError:
        pass
    client.close()


GONE, NEWER = "app disconnected", "replaced by a newer client"


def wait_watching(client: socket.socket, server, seconds: float):
    """Sleep up to `seconds`, returning GONE or NEWER as soon as either happens.
    `server` is None when newcomers must authenticate first: they wait in the
    listen backlog instead of cutting this client off."""
    end = time.monotonic() + seconds
    watch = [client] + ([server] if server else [])
    while (left := end - time.monotonic()) > 0:
        ready, _, _ = select.select(watch, [], [], left)
        if server and server in ready:
            return NEWER
        if client in ready:
            try:
                if not client.recv(512):  # anything else is dropped: nothing goes out before READY
                    return GONE
            except OSError:
                return GONE
    return None


def bring_up(client, server, open_adapter, deadline_s=LINK_DEADLINE_S, backoff=BACKOFF_S):
    """Open the adapter for a client, retrying with backoff while it isn't ready.
    Returns (link, None) or (None, GONE | NEWER | user-facing reason)."""
    say(client, "BRIDGE STATUS: connecting to the OBD adapter")
    start, attempt = time.monotonic(), 0
    while True:
        attempt += 1
        try:
            return open_adapter(), None
        except AdapterUnavailable as e:
            delay = backoff[min(attempt - 1, len(backoff) - 1)]
            if not e.retryable or time.monotonic() - start + delay > deadline_s:
                return None, e.message
            print(f"Attempt {attempt}: {e.short}", flush=True)
            say(client, f"BRIDGE STATUS: {e.short}, retrying in {delay:g}s (attempt {attempt})")
        outcome = wait_watching(client, server, delay)
        if outcome:
            return None, outcome


def detach(client, link, why: str) -> None:
    # Adapter first: closing the RFCOMM socket drops the Bluetooth link
    if link:
        try:
            link.close()
        except OSError:
            pass
    client.close()
    print(f"Client disconnected ({why})", flush=True)


def deny(sock: socket.socket, reason: str) -> None:
    """Refuse a client that never got a session. Bounded, unlike refuse(): a
    stranger must not be able to stall the session in progress."""
    try:
        say(sock, f"BRIDGE ERROR: {reason}")
        sock.shutdown(socket.SHUT_WR)
    except OSError:
        pass
    sock.close()


def serve(open_adapter, port: int, host: str = "0.0.0.0", label: str = "",
          deadline_s: float = LINK_DEADLINE_S, backoff=BACKOFF_S, token=None, policy=None) -> None:
    policy = policy or load_policy()
    server = socket.create_server((host, port), reuse_port=False)
    mode = "pairing token required" if token else "OPEN: no pairing token, anyone on the network can connect"
    print(f"Bridge listening on {host}:{port} -> {label} ({mode})", flush=True)
    client, link, line, overflow = None, None, b"", False
    pending = {}  # unauthenticated socket -> {"nonce", "deadline", "buf", "addr"}

    def adopt(new, addr):
        """Give the adapter to `new`. Newest client wins: the adapter has one
        session, and a client reconnecting usually means the old socket is
        already dead. With a token, only an authenticated client gets here."""
        nonlocal client, link, line, overflow
        if client:
            detach(client, link, f"replaced by {addr[0]}")
        client, link, line, overflow = new, None, b"", False
        print(f"Client {addr[0]} connected", flush=True)
        try:
            link, why = bring_up(client, None if token else server, open_adapter, deadline_s, backoff)
            if link:
                say(client, "BRIDGE READY")
                print("Adapter link up", flush=True)
                return
        except OSError as e:
            link, why = None, GONE
            print(f"Client lost while linking: {e}", flush=True)
        if why == GONE:
            detach(client, None, GONE)
        elif why == NEWER:
            refuse(client, "another device connected to the bridge")
            print(f"Client disconnected ({NEWER})", flush=True)
        else:
            print(f"Adapter unavailable: {why}", flush=True)
            refuse(client, why)
        client = None

    def check_auth(sock):
        p = pending[sock]
        try:
            data = sock.recv(512)
        except OSError:
            data = b""
        if not data:
            del pending[sock]
            sock.close()
            return
        p["buf"] += data
        if b"\r" not in p["buf"] and b"\n" not in p["buf"]:
            if len(p["buf"]) > 256:
                del pending[sock]
                deny(sock, "authentication failed: malformed reply")
            return
        answer = re.split(rb"[\r\n]", p["buf"], maxsplit=1)[0].decode("ascii", "replace").strip()
        del pending[sock]
        expected = "AUTH " + auth_response(token, p["nonce"])
        if hmac.compare_digest(answer.lower().encode(), expected.lower().encode()):
            adopt(sock, p["addr"])
        else:
            print(f"Client {p['addr'][0]} failed authentication", flush=True)
            deny(sock, "authentication failed: the pairing token doesn't match the bridge's. "
                       f"Copy it from {DEFAULT_TOKEN_FILE} on the board into the app")

    try:
        while True:
            watch = [server] + list(pending) + ([client, link] if client else [])
            wait = None
            if pending:
                wait = max(0.0, min(p["deadline"] for p in pending.values()) - time.monotonic())
            ready, _, _ = select.select(watch, [], [], wait)
            now = time.monotonic()
            for sock in [s for s, p in pending.items() if p["deadline"] <= now and s not in ready]:
                print(f"Client {pending[sock]['addr'][0]} did not authenticate in time", flush=True)
                del pending[sock]
                deny(sock, "authentication timed out: set the bridge's pairing token in the app")
            if server in ready:
                try:
                    new, addr = server.accept()
                except OSError as e:
                    # A client that reset mid-handshake must not take the bridge down
                    print(f"Accept error: {e}", flush=True)
                    continue
                try:
                    tune_client(new)
                    if not token:
                        adopt(new, addr)
                        continue
                    if len(pending) >= MAX_PENDING:
                        deny(new, "too many connections waiting to authenticate")
                        continue
                    nonce = secrets.token_hex(16)
                    say(new, f"BRIDGE AUTH {nonce}")
                    pending[new] = {"nonce": nonce, "deadline": now + AUTH_TIMEOUT_S, "buf": b"", "addr": addr}
                except OSError:
                    pending.pop(new, None)
                    new.close()
                continue
            ready_pending = [s for s in ready if s in pending]
            if ready_pending:
                for sock in ready_pending:
                    check_auth(sock)
                continue
            try:
                if client in ready:
                    data = client.recv(512)
                    if not data:
                        detach(client, link, "closed by app")
                        client, link = None, None
                        continue
                    # App -> adapter a line at a time so the policy sees whole commands
                    for b in data:
                        ch = bytes([b])
                        if ch == b"\r":
                            why = f"longer than {policy['maxLineLength']} characters" if overflow \
                                else refusal_reason(line, policy)
                            if why:
                                client.sendall(NOT_UNDERSTOOD)
                                print(f"Refused {line[:24]!r}: {why}", flush=True)
                            else:
                                adapter_write(link, line + b"\r")
                            line, overflow = b"", False
                        elif ch == b"\n":
                            continue
                        elif len(line) < policy["maxLineLength"]:
                            line += ch
                        else:
                            overflow = True  # never truncate: a cut-off command can be a different one
                if link in ready:
                    client.sendall(adapter_read(link))  # adapter -> app, unchanged
            except AdapterLost as e:
                try:
                    say(client, f"BRIDGE ERROR: lost the link to the OBD adapter ({e}): check the ignition and "
                                "that the board is in range, then connect again")
                except OSError:
                    pass
                detach(client, link, f"adapter link lost: {e}")
                client, link = None, None
            except OSError as e:
                detach(client, link, f"app link error: {e}")
                client, link = None, None
    finally:
        # systemctl stop / restart: release the adapter before exiting
        for sock in pending:
            sock.close()
        if client:
            detach(client, link, "bridge stopping")
        server.close()


def stop(*_) -> None:
    raise SystemExit(0)


def main() -> None:
    env = os.environ
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    src = p.add_mutually_exclusive_group()
    src.add_argument("--bt", default=None, metavar="MAC|auto",
                     help="Bluetooth OBD adapter (default: auto, the paired OBDLink)")
    src.add_argument("--device", help="serial OBD adapter instead, e.g. /dev/ttyUSB0")
    p.add_argument("--channel", type=int, default=1, help="RFCOMM channel (default 1)")
    p.add_argument("--baud", type=int, default=115200, choices=sorted(BAUDS))
    p.add_argument("--host", default=env.get("TATTLESTONE_BRIDGE_HOST", "0.0.0.0"),
                   help="address to listen on, e.g. the board's Wi-Fi address (default 0.0.0.0, every interface)")
    p.add_argument("--port", type=int, default=int(env.get("TATTLESTONE_BRIDGE_PORT", "35000")))
    p.add_argument("--token-file", default=env.get("TATTLESTONE_BRIDGE_TOKEN_FILE"),
                   help=f"pairing token the app must prove it holds (default {DEFAULT_TOKEN_FILE} if it exists)")
    p.add_argument("--new-token", metavar="PATH", help="write a new random pairing token to PATH, print it, and exit")
    a = p.parse_args()
    if a.new_token:
        print(write_new_token(a.new_token))
        return
    token = resolve_token(a.token_file, env)
    policy = load_policy()
    # SIGTERM runs the finally in serve() so the link is closed, not abandoned
    signal.signal(signal.SIGTERM, stop)
    if a.device:
        serve(serial_opener(a.device, a.baud), a.port, a.host, f"{a.device} @ {a.baud}", token=token, policy=policy)
    else:
        mac = a.bt or "auto"
        serve(bt_opener(mac, a.channel), a.port, a.host, f"Bluetooth {mac} channel {a.channel}",
              token=token, policy=policy)


if __name__ == "__main__":
    main()
