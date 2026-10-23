#!/usr/bin/env python3
"""Tattlestone Network Mode bridge for the Arduino UNO Q (Linux side).

Forwards bytes between one TCP client (the Tattlestone app) and an OBD adapter
on a serial device: the OBDLink MX bound over Bluetooth (/dev/rfcomm0) or a
USB STN1110/ELM327 (/dev/ttyUSB0, /dev/ttyACM0).

Traffic passes through untouched except for one guard: Mode 04 (clear DTCs)
is dropped, so the app's read-only promise holds for any client.

Stdlib only (no pyserial):
    python3 obd_tcp_bridge.py --device /dev/rfcomm0 --baud 115200 --port 35000
"""
import argparse
import os
import select
import socket
import termios
import time
import tty

BAUDS = {9600: termios.B9600, 38400: termios.B38400, 115200: termios.B115200}


def open_serial(path: str, baud: int) -> int:
    fd = os.open(path, os.O_RDWR | os.O_NOCTTY)
    tty.setraw(fd)
    attrs = termios.tcgetattr(fd)
    attrs[4] = attrs[5] = BAUDS[baud]          # ispeed, ospeed
    attrs[2] |= termios.CLOCAL | termios.CREAD  # ignore modem lines
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    return fd


def is_blocked(line: bytes) -> bool:
    return line.replace(b" ", b"").upper() == b"04"


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


def attach(client: socket.socket, addr, device: str, baud: int):
    """Open the adapter for a new client. Returns (client, fd), or (None, None)
    after telling the client why the adapter is unavailable."""
    tune_client(client)
    print(f"Client {addr[0]} connected", flush=True)
    try:
        return client, open_serial(device, baud)
    except OSError as e:
        print(f"Cannot open {device}: {e}", flush=True)
        try:
            # No '>' prompt: this is not an adapter reply. The app logs the
            # first RX chunks, so the reason lands in its session log.
            client.sendall(f"BRIDGE ERROR: cannot open {device}: {e.strerror}\r".encode("ascii", "replace"))
            # Closing with the app's ATZ still unread would send RST and
            # discard the message: FIN first, then drain until the app closes.
            client.shutdown(socket.SHUT_WR)
            client.settimeout(1)
            deadline = time.monotonic() + 1  # bounded: this blocks the one loop
            while time.monotonic() < deadline and client.recv(512):
                pass
        except OSError:
            pass
        client.close()
        return None, None


def detach(client: socket.socket, fd: int, why: str) -> None:
    os.close(fd)
    client.close()
    print(f"Client disconnected ({why})", flush=True)


def serve(device: str, baud: int, port: int) -> None:
    server = socket.create_server(("0.0.0.0", port), reuse_port=False)
    print(f"Bridge listening on :{port} -> {device} @ {baud}", flush=True)
    client, fd, line = None, None, b""
    while True:
        watch = [server] + ([client, fd] if client else [])
        ready, _, _ = select.select(watch, [], [])
        if server in ready:
            # Newest client wins: the adapter has one session, and a client
            # reconnecting usually means the old socket is already dead.
            try:
                new, addr = server.accept()
                if client:
                    detach(client, fd, f"replaced by {addr[0]}")
                    client, fd = None, None
                client, fd = attach(new, addr, device, baud)
            except OSError as e:
                # A client that reset mid-handshake must not take the bridge down
                print(f"Accept error: {e}", flush=True)
            line = b""
            continue
        try:
            if client in ready:
                data = client.recv(512)
                if not data:
                    detach(client, fd, "closed by app")
                    client, fd = None, None
                    continue
                # App -> adapter a line at a time so the guard sees whole commands
                for b in data:
                    ch = bytes([b])
                    if ch == b"\r":
                        if is_blocked(line):
                            client.sendall(b"?\r\r>")  # an ELM327's answer to an unknown command
                            print("Blocked Mode 04 (clear DTCs)", flush=True)
                        else:
                            os.write(fd, line + b"\r")
                        line = b""
                    elif ch != b"\n" and len(line) < 64:
                        line += ch
            if fd in ready:
                out = os.read(fd, 512)
                if not out:
                    raise OSError("adapter closed the serial link")
                client.sendall(out)  # adapter -> app, unchanged
        except OSError as e:
            detach(client, fd, f"link error: {e}")
            client, fd = None, None


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--device", default="/dev/rfcomm0")
    p.add_argument("--baud", type=int, default=115200, choices=sorted(BAUDS))
    p.add_argument("--port", type=int, default=35000)
    a = p.parse_args()
    serve(a.device, a.baud, a.port)
