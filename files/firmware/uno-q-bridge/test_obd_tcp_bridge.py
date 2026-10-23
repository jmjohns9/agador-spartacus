#!/usr/bin/env python3
"""Bridge tests with no OBD hardware. Serial adapters are a pty whose far end
answers like elm327_emulator; the Bluetooth adapter is a socketpair handed out
by a stand-in for bt_connect. Stdlib only:  python3 -m unittest test_obd_tcp_bridge"""
import errno
import os
import pty
import signal
import socket
import subprocess
import sys
import threading
import time
import tty
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import obd_tcp_bridge as bridge  # noqa: E402
from elm327_emulator import Engine, respond  # noqa: E402

MAC = "00:04:3E:12:34:56"


def emulate(read, write, released=None):
    """Answer CR-terminated commands like an ELM327 until the link closes."""
    engine, buf = Engine(), b""
    while True:
        try:
            chunk = read(512)
        except OSError:
            chunk = b""
        if not chunk:
            if released:
                released.set()
            return
        buf += chunk
        while b"\r" in buf:
            line, buf = buf.split(b"\r", 1)
            if line.strip():
                write((respond(line.decode(), engine) + "\r\r>").encode())


def fake_adapter():
    """Start a pty-backed ELM327; returns the device path to hand the bridge."""
    master, slave = pty.openpty()
    tty.setraw(master)
    threading.Thread(target=emulate, args=(lambda n: os.read(master, n), lambda b: os.write(master, b)),
                     daemon=True).start()
    return os.ttyname(slave), slave


class FakeBluetooth:
    """Stands in for bt_connect: fails `failures` times with `error`, then hands
    out a socketpair end wired to an emulated ELM327."""

    def __init__(self, failures=0, error=errno.EHOSTDOWN):
        self.failures, self.error = failures, error
        self.calls, self.released, self.far_ends = 0, [], []

    def connect(self, mac, channel):
        self.calls += 1
        if self.calls <= self.failures:
            raise OSError(self.error, os.strerror(self.error))
        ours, theirs = socket.socketpair()
        released = threading.Event()
        self.released.append(released)
        self.far_ends.append(theirs)
        threading.Thread(target=emulate, args=(theirs.recv, theirs.sendall, released), daemon=True).start()
        return ours

    def drop(self):
        """The truck drives off: the adapter end of the newest link goes away."""
        self.far_ends[-1].shutdown(socket.SHUT_RDWR)
        self.far_ends[-1].close()


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def read_until(sock, done, timeout=3.0):
    sock.settimeout(timeout)
    buf = b""
    try:
        while not done(buf):
            d = sock.recv(512)
            if not d:
                break
            buf += d
    except socket.timeout:
        pass
    return buf.decode()


def handshake(sock, timeout=3.0):
    """The bridge's lines up to READY or ERROR."""
    text = read_until(sock, lambda b: b.endswith(b"BRIDGE READY\r") or (b"BRIDGE ERROR" in b and b.endswith(b"\r")),
                      timeout)
    return [line for line in text.split("\r") if line]


def ask(sock, cmd, timeout=2.0):
    """Send one command; return the reply up to and including '>' (or what arrived)."""
    sock.sendall(cmd.encode() + b"\r")
    return read_until(sock, lambda b: b.endswith(b">"), timeout)


class SerialBridgeTest(unittest.TestCase):
    """The bridge as systemd runs it, with --device."""

    def start_bridge(self, device):
        self.port = free_port()
        self.proc = subprocess.Popen(
            [sys.executable, "-u", os.path.join(HERE, "obd_tcp_bridge.py"), "--device", device, "--port", str(self.port)],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        self.addCleanup(self.proc.stdout.close)
        self.addCleanup(self.proc.wait)
        self.addCleanup(self.proc.kill)
        self.assertIn("listening", self.proc.stdout.readline())

    def connect(self):
        s = socket.create_connection(("127.0.0.1", self.port), timeout=2)
        self.addCleanup(s.close)
        return s

    def session(self):
        s = self.connect()
        self.assertEqual(handshake(s), ["BRIDGE STATUS: connecting to the OBD adapter", "BRIDGE READY"])
        return s

    def test_round_trip_and_mode04_guard(self):
        dev, slave = fake_adapter()
        self.addCleanup(os.close, slave)
        self.start_bridge(dev)
        c = self.session()
        self.assertEqual(ask(c, "ATZ"), "ELM327 v1.5\r\r>")
        self.assertRegex(ask(c, "010C"), r"^410C[0-9A-F]{4}\r\r>$")
        self.assertEqual(ask(c, "04"), "?\r\r>")

    def test_newest_client_replaces_a_stale_one(self):
        dev, slave = fake_adapter()
        self.addCleanup(os.close, slave)
        self.start_bridge(dev)
        old = self.session()
        self.assertEqual(ask(old, "ATI"), "ELM327 v1.5\r\r>")
        new = self.session()  # old never closed: a Mac that left Wi-Fi
        self.assertEqual(ask(new, "ATI"), "ELM327 v1.5\r\r>")
        old.settimeout(2)
        self.assertEqual(old.recv(64), b"", "replaced client is closed")

    def test_reconnect_after_app_disconnects(self):
        dev, slave = fake_adapter()
        self.addCleanup(os.close, slave)
        self.start_bridge(dev)
        first = self.session()
        ask(first, "ATZ")
        first.close()
        time.sleep(0.2)
        self.assertEqual(ask(self.session(), "ATI"), "ELM327 v1.5\r\r>")

    def test_missing_device_is_reported_to_the_client(self):
        self.start_bridge("/dev/does-not-exist")
        lines = handshake(self.connect())
        self.assertTrue(lines[-1].startswith("BRIDGE ERROR: cannot open /dev/does-not-exist"), lines)
        self.assertIn("USB cable", lines[-1])
        # and the bridge keeps serving later clients
        self.assertIn("BRIDGE ERROR", handshake(self.connect())[-1])

    def test_an_rfcomm_device_points_at_the_bluetooth_mode(self):
        self.start_bridge("/dev/rfcomm9")
        self.assertIn("--bt auto", handshake(self.connect())[-1])

    def test_sigterm_closes_the_session_and_exits(self):
        dev, slave = fake_adapter()
        self.addCleanup(os.close, slave)
        self.start_bridge(dev)
        c = self.session()
        self.proc.send_signal(signal.SIGTERM)
        self.assertEqual(self.proc.wait(timeout=3), 0)
        c.settimeout(2)
        self.assertEqual(c.recv(64), b"", "client is closed when the bridge stops")


class BluetoothBridgeTest(unittest.TestCase):
    """The default --bt mode, with the RFCOMM connect replaced by FakeBluetooth."""

    def start_bridge(self, fake, find=lambda: MAC, deadline_s=5.0, backoff=(0.05,)):
        self.port = free_port()
        opener = bridge.bt_opener("auto", 1, find=find, connect=fake.connect)
        threading.Thread(target=bridge.serve, args=(opener, self.port, "127.0.0.1", "test", deadline_s, backoff),
                         daemon=True).start()
        for _ in range(100):
            try:
                socket.create_connection(("127.0.0.1", self.port), timeout=0.2).close()
                break
            except OSError:
                time.sleep(0.02)
        time.sleep(0.2)  # let the bridge retire that probe connection
        fake.calls = 0  # the probe is not part of the test
        fake.released.clear()
        fake.far_ends.clear()

    def connect(self):
        s = socket.create_connection(("127.0.0.1", self.port), timeout=2)
        self.addCleanup(s.close)
        return s

    def test_handshake_round_trip_and_guard(self):
        fake = FakeBluetooth()
        self.start_bridge(fake)
        c = self.connect()
        self.assertEqual(handshake(c), ["BRIDGE STATUS: connecting to the OBD adapter", "BRIDGE READY"])
        self.assertEqual(ask(c, "ATZ"), "ELM327 v1.5\r\r>")
        self.assertEqual(ask(c, "04"), "?\r\r>")

    def test_retries_while_the_adapter_is_not_ready(self):
        fake = FakeBluetooth(failures=2)
        self.start_bridge(fake)
        lines = handshake(self.connect())
        self.assertEqual(lines[-1], "BRIDGE READY")
        retries = [line for line in lines if "retrying" in line]
        self.assertEqual(len(retries), 2, lines)
        self.assertIn(f"OBDLink {MAC} not answering", retries[0])
        self.assertIn("(attempt 1)", retries[0])
        self.assertEqual(fake.calls, 3)

    def test_gives_up_at_the_deadline_with_next_steps(self):
        fake = FakeBluetooth(failures=10**6)
        self.start_bridge(fake, deadline_s=0.4, backoff=(0.1,))
        t0 = time.monotonic()
        last = handshake(self.connect())[-1]
        self.assertLess(time.monotonic() - t0, 2)
        self.assertTrue(last.startswith(f"BRIDGE ERROR: the OBDLink ({MAC}) is not answering"), last)
        self.assertIn("ignition", last)
        fake.failures = 0  # adapter comes into range: the next client gets through
        self.assertEqual(handshake(self.connect())[-1], "BRIDGE READY")

    def test_app_leaving_while_linking_stops_the_retries(self):
        fake = FakeBluetooth(failures=10**6)
        self.start_bridge(fake, backoff=(0.1,))
        c = self.connect()
        read_until(c, lambda b: b"retrying" in b)
        c.close()
        time.sleep(0.4)
        settled = fake.calls
        time.sleep(0.5)
        self.assertEqual(fake.calls, settled, "bridge kept dialling the adapter for an app that left")

    def test_clean_close_releases_the_link_and_reconnect_gets_a_fresh_one(self):
        fake = FakeBluetooth()
        self.start_bridge(fake)
        first = self.connect()
        handshake(first)
        self.assertEqual(ask(first, "ATI"), "ELM327 v1.5\r\r>")
        first.close()
        self.assertTrue(fake.released[-1].wait(2), "Bluetooth link still open after the app closed")
        links = len(fake.released)
        second = self.connect()
        self.assertEqual(handshake(second)[-1], "BRIDGE READY")
        self.assertEqual(len(fake.released), links + 1)
        self.assertEqual(ask(second, "ATI"), "ELM327 v1.5\r\r>")

    def test_adapter_drop_is_reported_and_the_app_is_closed(self):
        fake = FakeBluetooth()
        self.start_bridge(fake)
        c = self.connect()
        handshake(c)
        fake.drop()
        text = read_until(c, lambda b: False, timeout=2)  # until the bridge closes
        self.assertIn("BRIDGE ERROR: lost the link to the OBD adapter", text)

    def test_newer_client_replaces_one_still_linking(self):
        fake = FakeBluetooth(failures=10**6)
        self.start_bridge(fake, backoff=(0.1,))
        first = self.connect()
        read_until(first, lambda b: b"retrying" in b)
        second = self.connect()
        self.assertIn("BRIDGE ERROR: another device connected", handshake(first)[-1])
        fake.failures = 0
        self.assertEqual(handshake(second)[-1], "BRIDGE READY")

    def test_no_paired_adapter_explains_pairing_without_retrying(self):
        fake = FakeBluetooth()
        self.start_bridge(fake, find=lambda: None)
        calls = fake.calls
        last = handshake(self.connect())[-1]
        self.assertIn("no paired OBDLink on this board", last)
        self.assertIn("trust ADDRESS", last)
        self.assertEqual(fake.calls, calls, "nothing to dial without a paired adapter")


class DiscoveryAndErrorsTest(unittest.TestCase):
    def run_with(self, outputs):
        def run(args, **_):
            out = outputs.get(" ".join(args[1:]))
            if isinstance(out, Exception):
                raise out
            return subprocess.CompletedProcess(args, 0, stdout=out or "")
        return run

    def test_finds_the_paired_obdlink(self):
        run = self.run_with({"devices Paired": f"Device AA:BB:CC:DD:EE:FF Josh's AirPods\nDevice {MAC.lower()} OBDLinkMX13659\n"})
        self.assertEqual(bridge.find_paired_obd(run), MAC)

    def test_ignores_devices_that_are_not_obd_adapters(self):
        run = self.run_with({"devices Paired": "Device AA:BB:CC:DD:EE:FF Josh's AirPods\n"})
        self.assertIsNone(bridge.find_paired_obd(run))

    def test_falls_back_to_paired_devices_on_older_bluez(self):
        run = self.run_with({"devices Paired": OSError("no such command"),
                             "paired-devices": f"Device {MAC} OBDLink MX+\n"})
        self.assertEqual(bridge.find_paired_obd(run), MAC)

    def test_errors_say_what_to_do(self):
        def err(code):
            return bridge.describe_bt_error(OSError(code, os.strerror(code)), MAC, 1)
        self.assertIn("sdptool browse", err(errno.ECONNREFUSED).message)
        self.assertIn("rfcomm release all", err(errno.EBUSY).message)
        self.assertFalse(err(errno.EACCES).retryable)
        timeout = bridge.describe_bt_error(socket.timeout("timed out"), MAC, 1)
        self.assertTrue(timeout.retryable)
        self.assertIn("ignition", timeout.message)


if __name__ == "__main__":
    unittest.main()
