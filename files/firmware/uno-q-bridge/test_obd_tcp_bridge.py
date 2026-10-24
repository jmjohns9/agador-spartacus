#!/usr/bin/env python3
"""Bridge tests with no OBD hardware. Serial adapters are a pty whose far end
answers like elm327_emulator; the Bluetooth adapter is a socketpair handed out
by a stand-in for bt_connect. Stdlib only:  python3 -m unittest test_obd_tcp_bridge"""
import errno
import json
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


def emulate(read, write, released=None, seen=None):
    """Answer CR-terminated commands like an ELM327 until the link closes.
    Every line the adapter receives is appended to `seen` when given."""
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
            if seen is not None:
                seen.append(line)
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
        self.calls, self.released, self.far_ends, self.seen = 0, [], [], []

    def connect(self, mac, channel):
        self.calls += 1
        if self.calls <= self.failures:
            raise OSError(self.error, os.strerror(self.error))
        ours, theirs = socket.socketpair()
        released = threading.Event()
        self.released.append(released)
        self.far_ends.append(theirs)
        threading.Thread(target=emulate, args=(theirs.recv, theirs.sendall, released, self.seen),
                         daemon=True).start()
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

    def test_round_trip_and_write_guard(self):
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

    def start_bridge(self, fake, find=lambda: MAC, deadline_s=5.0, backoff=(0.05,), token=None):
        self.port = free_port()
        opener = bridge.bt_opener("auto", 1, find=find, connect=fake.connect)
        threading.Thread(target=bridge.serve, args=(opener, self.port, "127.0.0.1", "test", deadline_s, backoff),
                         kwargs={"token": token}, daemon=True).start()
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


TOKEN = "correct-horse-battery-staple"


def authenticate(sock, token=TOKEN):
    """Answer the bridge's challenge; returns the lines that follow, to READY or ERROR."""
    challenge = read_until(sock, lambda b: b.endswith(b"\r"))
    assert challenge.startswith("BRIDGE AUTH "), challenge
    sock.sendall(f"AUTH {bridge.auth_response(token, challenge.split()[2])}\r".encode())
    return handshake(sock)


class PolicyTest(unittest.TestCase):
    """The same cases as src/shared/commandPolicy.test.ts."""

    policy = bridge.load_policy()

    def allowed(self, *cmds):
        for c in cmds:
            self.assertIsNone(bridge.refusal_reason(c.encode("latin-1"), self.policy), c)

    def refused(self, *cmds):
        for c in cmds:
            self.assertIsNotNone(bridge.refusal_reason(c.encode("latin-1"), self.policy), c)

    def test_the_app_and_the_bridge_ship_the_same_policy(self):
        app_copy = os.path.join(HERE, "..", "..", "src", "shared", "command-policy.json")
        if not os.path.exists(app_copy):
            self.skipTest("not in the repository checkout")
        with open(app_copy) as f:
            self.assertEqual(json.load(f), self.policy)

    def test_reads_and_adapter_commands_pass(self):
        self.allowed("ATZ", "ATI", "ATE0", "ATSP0", "ATSH 6C 10 F0", "ATSR F0", "STI", "STDI", "010C", "01 0c",
                     "03", "07", "0A", "0902", "3C 01", "22 F1 90", "19 02 FF", "atsp a2", "")

    def test_writes_clears_resets_and_programming_are_refused(self):
        self.refused("04", "0 4", "04\t", "0400", "08", "11 01", "14FF00", "14 FF FF FF", "10 02", "27 01", "28 00",
                     "2E F1 90 00", "2F 01", "31 01 FF 00", "34 00", "36 01", "3B 01", "3D 00", "85 02", "A5", "AE")

    def test_passthrough_and_dangerous_adapter_settings_are_refused(self):
        self.refused("STPX H:7E0,D:04", "STSBR 2000000", "ATCAF0", "AT CAF 0", "ATPP 2D SV 00", "ATWM 81 10 F1 04",
                     "ATFC SD 30 00 00")
        self.allowed("ATCAF1", "STIX", "STDIX", "STSN", "STMFR")

    def test_malformed_lines_are_refused(self):
        self.refused("010C\r04", "010C\n04", "ATSH" + "0" * 61, "01\x000C", "010C1", "HELLO", "01\xff")

    def test_a_missing_policy_stops_the_bridge(self):
        with self.assertRaises(SystemExit) as cm:
            bridge.load_policy("/nonexistent/command_policy.json")
        self.assertIn("command_policy.json", str(cm.exception))


class GuardTest(unittest.TestCase):
    """What reaches the adapter, end to end through the forwarding loop."""

    start_bridge = BluetoothBridgeTest.start_bridge
    connect = BluetoothBridgeTest.connect

    def test_refused_commands_get_a_question_mark_and_never_reach_the_adapter(self):
        fake = FakeBluetooth()
        self.start_bridge(fake)
        c = self.connect()
        handshake(c)
        for cmd in ("04", "0400", "04\t", "14FF00", "10 02", "STPX H:7E0,D:04", "ATCAF0"):
            self.assertEqual(ask(c, cmd), "?\r\r>", cmd)
        self.assertEqual(ask(c, "ATI"), "ELM327 v1.5\r\r>")
        self.assertEqual(fake.seen, [b"ATI"])

    def test_an_over_long_line_is_refused_whole_not_truncated(self):
        fake = FakeBluetooth()
        self.start_bridge(fake)
        c = self.connect()
        handshake(c)
        self.assertEqual(ask(c, "ATSH7E0" + "X" * 70), "?\r\r>")
        self.assertEqual(ask(c, "ATI"), "ELM327 v1.5\r\r>", "the next command starts clean")
        self.assertEqual(fake.seen, [b"ATI"])


class AuthTest(unittest.TestCase):
    """A bridge started with a pairing token."""

    start_bridge = BluetoothBridgeTest.start_bridge
    connect = BluetoothBridgeTest.connect

    def setUp(self):
        self.addCleanup(setattr, bridge, "AUTH_TIMEOUT_S", bridge.AUTH_TIMEOUT_S)
        bridge.AUTH_TIMEOUT_S = 0.5
        self.fake = FakeBluetooth()
        self.start_bridge(self.fake, token=TOKEN)

    def test_the_right_token_gets_a_session(self):
        c = self.connect()
        self.assertEqual(authenticate(c), ["BRIDGE STATUS: connecting to the OBD adapter", "BRIDGE READY"])
        self.assertEqual(ask(c, "ATI"), "ELM327 v1.5\r\r>")

    def test_each_connection_gets_a_fresh_challenge(self):
        nonces = set()
        for _ in range(3):
            c = self.connect()
            nonces.add(read_until(c, lambda b: b.endswith(b"\r")))
            c.close()
        self.assertEqual(len(nonces), 3)

    def test_a_wrong_token_is_refused_and_the_adapter_never_opened(self):
        lines = authenticate(self.connect(), token="not-the-token-at-all")
        self.assertTrue(lines[-1].startswith("BRIDGE ERROR: authentication failed"), lines)
        self.assertEqual(self.fake.calls, 0)

    def test_replaying_an_old_answer_fails(self):
        first = self.connect()
        nonce = read_until(first, lambda b: b.endswith(b"\r")).split()[2]
        first.close()
        replay = self.connect()
        read_until(replay, lambda b: b.endswith(b"\r"))
        replay.sendall(f"AUTH {bridge.auth_response(TOKEN, nonce)}\r".encode())
        self.assertIn("authentication failed", handshake(replay)[-1])

    def test_a_silent_client_times_out(self):
        c = self.connect()
        self.assertIn("authentication timed out", handshake(c, timeout=3)[-1])

    def test_strangers_cannot_take_over_or_stall_a_session(self):
        owner = self.connect()
        self.assertEqual(authenticate(owner)[-1], "BRIDGE READY")
        silent = self.connect()  # holds a pending slot without answering
        wrong = self.connect()
        self.assertIn("authentication failed", authenticate(wrong, token="wrong-token-wrong-token")[-1])
        t0 = time.monotonic()
        self.assertEqual(ask(owner, "ATI"), "ELM327 v1.5\r\r>")
        self.assertLess(time.monotonic() - t0, 0.4, "the session waited on an unauthenticated client")
        self.assertIn("timed out", handshake(silent, timeout=3)[-1])
        self.assertEqual(ask(owner, "ATI"), "ELM327 v1.5\r\r>", "owner still has the adapter")

    def test_an_authenticated_newcomer_replaces_the_old_client(self):
        old = self.connect()
        authenticate(old)
        new = self.connect()
        self.assertEqual(authenticate(new)[-1], "BRIDGE READY")
        self.assertEqual(ask(new, "ATI"), "ELM327 v1.5\r\r>")
        old.settimeout(2)
        self.assertEqual(old.recv(64), b"", "replaced client is closed")


class CommandLineTest(unittest.TestCase):
    def run_bridge(self, *args, env=None):
        return subprocess.run([sys.executable, os.path.join(HERE, "obd_tcp_bridge.py"), *args],
                              capture_output=True, text=True, timeout=10,
                              env={**os.environ, **(env or {})})

    def test_new_token_writes_a_private_file_and_prints_it(self):
        path = os.path.join(self.tmpdir(), "sub", "bridge-token")
        out = self.run_bridge("--new-token", path)
        self.assertEqual(out.returncode, 0, out.stderr)
        with open(path) as f:
            self.assertEqual(f.read().strip(), out.stdout.strip())
        self.assertGreaterEqual(len(out.stdout.strip()), bridge.MIN_TOKEN_LEN)
        self.assertEqual(os.stat(path).st_mode & 0o777, 0o640)

    def test_a_token_file_that_was_asked_for_but_is_missing_stops_the_bridge(self):
        out = self.run_bridge("--device", "/dev/null", "--port", str(free_port()), "--token-file", "/nonexistent/t")
        self.assertNotEqual(out.returncode, 0)
        self.assertIn("cannot read the pairing token", out.stderr)

    def test_a_short_token_is_rejected(self):
        out = self.run_bridge("--device", "/dev/null", "--port", str(free_port()),
                              env={"TATTLESTONE_BRIDGE_TOKEN": "short"})
        self.assertNotEqual(out.returncode, 0)
        self.assertIn("shorter than", out.stderr)

    def test_host_and_token_come_from_flags_or_the_environment(self):
        port = free_port()
        proc = subprocess.Popen(
            [sys.executable, "-u", os.path.join(HERE, "obd_tcp_bridge.py"), "--device", "/dev/null",
             "--port", str(port), "--host", "127.0.0.1"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
            env={**os.environ, "TATTLESTONE_BRIDGE_TOKEN": TOKEN})
        self.addCleanup(proc.stdout.close)
        self.addCleanup(proc.wait)
        self.addCleanup(proc.kill)
        first = proc.stdout.readline()
        self.assertIn(f"listening on 127.0.0.1:{port}", first)
        self.assertIn("pairing token required", first)

    def tmpdir(self):
        import tempfile
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        return d.name


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
