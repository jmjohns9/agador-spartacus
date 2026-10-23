#!/usr/bin/env python3
"""Bridge tests with no OBD hardware: the serial device is a pty whose far end
answers like elm327_emulator. Stdlib only:  python3 -m unittest test_obd_tcp_bridge"""
import os
import pty
import socket
import subprocess
import sys
import threading
import time
import tty
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from elm327_emulator import Engine, respond  # noqa: E402


def fake_adapter():
    """Start a pty-backed ELM327; returns the device path to hand the bridge."""
    master, slave = pty.openpty()
    tty.setraw(master)

    def run():
        engine, buf = Engine(), b""
        while True:
            try:
                buf += os.read(master, 512)
            except OSError:
                return
            while b"\r" in buf:
                line, buf = buf.split(b"\r", 1)
                if line.strip():
                    os.write(master, (respond(line.decode(), engine) + "\r\r>").encode())

    threading.Thread(target=run, daemon=True).start()
    return os.ttyname(slave), slave


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def ask(sock, cmd, timeout=2.0):
    """Send one command; return the reply up to and including '>' (or what arrived)."""
    sock.settimeout(timeout)
    sock.sendall(cmd.encode() + b"\r")
    buf = b""
    try:
        while not buf.endswith(b">"):
            d = sock.recv(512)
            if not d:
                break
            buf += d
    except socket.timeout:
        pass
    return buf.decode()


class BridgeTest(unittest.TestCase):
    def start_bridge(self, device):
        self.port = free_port()
        self.proc = subprocess.Popen(
            [sys.executable, "-u", os.path.join(HERE, "obd_tcp_bridge.py"), "--device", device, "--port", str(self.port)],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        self.addCleanup(self.proc.stdout.close)
        self.addCleanup(self.proc.kill)
        self.assertIn("listening", self.proc.stdout.readline())

    def connect(self):
        s = socket.create_connection(("127.0.0.1", self.port), timeout=2)
        self.addCleanup(s.close)
        return s

    def test_round_trip_and_mode04_guard(self):
        dev, slave = fake_adapter()
        self.addCleanup(os.close, slave)
        self.start_bridge(dev)
        c = self.connect()
        self.assertEqual(ask(c, "ATZ"), "ELM327 v1.5\r\r>")
        self.assertRegex(ask(c, "010C"), r"^410C[0-9A-F]{4}\r\r>$")
        self.assertEqual(ask(c, "04"), "?\r\r>")

    def test_newest_client_replaces_a_stale_one(self):
        dev, slave = fake_adapter()
        self.addCleanup(os.close, slave)
        self.start_bridge(dev)
        old = self.connect()
        self.assertEqual(ask(old, "ATI"), "ELM327 v1.5\r\r>")
        new = self.connect()  # old never closed: a Mac that left Wi-Fi
        self.assertEqual(ask(new, "ATI"), "ELM327 v1.5\r\r>")
        old.settimeout(2)
        self.assertEqual(old.recv(64), b"", "replaced client is closed")

    def test_reconnect_after_app_disconnects(self):
        dev, slave = fake_adapter()
        self.addCleanup(os.close, slave)
        self.start_bridge(dev)
        first = self.connect()
        ask(first, "ATZ")
        first.close()
        time.sleep(0.2)
        self.assertEqual(ask(self.connect(), "ATI"), "ELM327 v1.5\r\r>")

    def test_missing_device_is_reported_to_the_client(self):
        self.start_bridge("/dev/does-not-exist")
        c = self.connect()
        reply = ask(c, "ATZ")
        self.assertIn("BRIDGE ERROR: cannot open /dev/does-not-exist", reply)
        # and the bridge keeps serving later clients
        self.assertIn("BRIDGE ERROR", ask(self.connect(), "ATZ"))


if __name__ == "__main__":
    unittest.main()
