#!/usr/bin/env python3
"""Tattlestone Network Mode bridge for the Arduino UNO Q (Linux side).

Forwards bytes between one TCP client (the Tattlestone app) and an OBD adapter:
the OBDLink MX over a Bluetooth RFCOMM socket the bridge opens itself (no
/dev/rfcomm0, no `rfcomm bind`), or a USB STN1110/ELM327 serial device.

Before any adapter traffic the bridge tells the app how the link is going:
    BRIDGE STATUS: <progress>\\r     zero or more
    BRIDGE READY\\r                  link up; ELM327 traffic follows
    BRIDGE ERROR: <what to do>\\r    then the bridge closes the connection

Traffic passes through untouched except for one guard: Mode 04 (clear DTCs)
is dropped, so the app's read-only promise holds for any client.

Stdlib only (no pyserial, no pybluez):
    python3 obd_tcp_bridge.py --bt auto --port 35000          # paired OBDLink
    python3 obd_tcp_bridge.py --device /dev/ttyUSB0 --baud 115200
"""
import argparse
import errno
import os
import re
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


def is_blocked(line: bytes) -> bool:
    return line.replace(b" ", b"").upper() == b"04"


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


def wait_watching(client: socket.socket, server: socket.socket, seconds: float):
    """Sleep up to `seconds`, returning GONE or NEWER as soon as either happens."""
    end = time.monotonic() + seconds
    while (left := end - time.monotonic()) > 0:
        ready, _, _ = select.select([client, server], [], [], left)
        if server in ready:
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


def serve(open_adapter, port: int, host: str = "0.0.0.0", label: str = "",
          deadline_s: float = LINK_DEADLINE_S, backoff=BACKOFF_S) -> None:
    server = socket.create_server((host, port), reuse_port=False)
    print(f"Bridge listening on :{port} -> {label}", flush=True)
    client, link, line = None, None, b""
    try:
        while True:
            watch = [server] + ([client, link] if client else [])
            ready, _, _ = select.select(watch, [], [])
            if server in ready:
                # Newest client wins: the adapter has one session, and a client
                # reconnecting usually means the old socket is already dead.
                try:
                    new, addr = server.accept()
                except OSError as e:
                    # A client that reset mid-handshake must not take the bridge down
                    print(f"Accept error: {e}", flush=True)
                    continue
                if client:
                    detach(client, link, f"replaced by {addr[0]}")
                client, link, line = new, None, b""
                tune_client(client)
                print(f"Client {addr[0]} connected", flush=True)
                try:
                    link, why = bring_up(client, server, open_adapter, deadline_s, backoff)
                    if link:
                        say(client, "BRIDGE READY")
                        print("Adapter link up", flush=True)
                        continue
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
                continue
            try:
                if client in ready:
                    data = client.recv(512)
                    if not data:
                        detach(client, link, "closed by app")
                        client, link = None, None
                        continue
                    # App -> adapter a line at a time so the guard sees whole commands
                    for b in data:
                        ch = bytes([b])
                        if ch == b"\r":
                            if is_blocked(line):
                                client.sendall(b"?\r\r>")  # an ELM327's answer to an unknown command
                                print("Blocked Mode 04 (clear DTCs)", flush=True)
                            else:
                                adapter_write(link, line + b"\r")
                            line = b""
                        elif ch != b"\n" and len(line) < 64:
                            line += ch
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
        if client:
            detach(client, link, "bridge stopping")
        server.close()


def stop(*_) -> None:
    raise SystemExit(0)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    src = p.add_mutually_exclusive_group()
    src.add_argument("--bt", default=None, metavar="MAC|auto",
                     help="Bluetooth OBD adapter (default: auto, the paired OBDLink)")
    src.add_argument("--device", help="serial OBD adapter instead, e.g. /dev/ttyUSB0")
    p.add_argument("--channel", type=int, default=1, help="RFCOMM channel (default 1)")
    p.add_argument("--baud", type=int, default=115200, choices=sorted(BAUDS))
    p.add_argument("--port", type=int, default=35000)
    a = p.parse_args()
    # SIGTERM runs the finally in serve() so the link is closed, not abandoned
    signal.signal(signal.SIGTERM, stop)
    if a.device:
        serve(serial_opener(a.device, a.baud), a.port, label=f"{a.device} @ {a.baud}")
    else:
        mac = a.bt or "auto"
        serve(bt_opener(mac, a.channel), a.port, label=f"Bluetooth {mac} channel {a.channel}")


if __name__ == "__main__":
    main()
