#!/usr/bin/env python3
"""Tattlestone ELM327 emulator for the Arduino UNO Q (Linux side).

Answers the app's ELM327/OBD commands itself, no OBD adapter attached, so the
Mac app can be driven end to end over Network Mode. Engine values are synthetic
(a 2004 Silverado at idle, like the app's built-in simulator); a few PIDs carry
real readings from the board, so you can see the Arduino's own data arrive:

    0146  ambient air temp   <- SoC temperature (/sys/class/thermal)
    011F  run time           <- board uptime
    0142  module voltage     <- slow 12.89 V -> 11.8 V parasitic-draw drift
                                (swap in an ADC reading once a divider is wired)

Listens on 127.0.0.1 by default: reach it from the Mac through SSH,
    ssh -N -L 35000:localhost:35000 arduino@tattlestone.local
then connect the app to 127.0.0.1:35000.  --host 0.0.0.0 opens it to the LAN.

    python3 elm327_emulator.py [--host 127.0.0.1] [--port 35000]
"""
import argparse
import glob
import random
import socket
import threading
import time

VIN = "1GCEK19T44E123456"
CALID = "12592618"
CVN = [0x4F, 0x1A, 0x9C, 0x22]
START = time.time()


def soc_temp_c():
    """Hottest thermal zone on the board, in deg C (None if unreadable)."""
    temps = []
    for path in glob.glob("/sys/class/thermal/thermal_zone*/temp"):
        try:
            with open(path) as f:
                temps.append(int(f.read().strip()) / 1000)
        except (OSError, ValueError):
            pass
    return max(temps) if temps else None


def uptime_s():
    try:
        with open("/proc/uptime") as f:
            return float(f.read().split()[0])
    except OSError:
        return time.time() - START


def h1(v):
    return f"{min(255, max(0, round(v))):02X}"


def h2(v):
    return f"{min(65535, max(0, round(v))):04X}"


def trim(pct):
    return h1(pct / 100 * 128 + 128)


class Engine:
    """Idle values that wander and pull back, as the app's simulator does."""

    def __init__(self):
        self.s = dict(rpm=820.0, stft1=4.7, ltft1=8.2, o2=0.72)

    def tick(self):
        s, n = self.s, lambda a: (random.random() - 0.5) * 2 * a
        s["rpm"] = max(0, s["rpm"] + n(20) + (820 - s["rpm"]) * 0.05)
        s["stft1"] = max(-25, min(25, s["stft1"] + n(0.2) + (4.7 - s["stft1"]) * 0.05))
        s["ltft1"] = max(-25, min(25, s["ltft1"] + n(0.05) + (8.2 - s["ltft1"]) * 0.05))
        s["o2"] = max(0.1, min(0.9, s["o2"] + n(0.08)))

    def battery(self):
        mins = (time.time() - START) / 60
        drift = mins * 0.004 + (max(0, mins - 15) * 0.001)
        return max(11.8, 12.89 - drift + (random.random() - 0.5) * 0.01)

    def pids(self):
        s = self.s
        amb = soc_temp_c()
        return {
            "010C": lambda: "410C" + h2(s["rpm"] * 4),
            "010D": lambda: "410D00",
            "0105": lambda: "4105" + h1(92 + 40),
            "015C": lambda: "415C" + h1(90 + 40),
            "010F": lambda: "410F" + h1(27 + 40),
            "0146": lambda: "4146" + h1((amb if amb is not None else 20) + 40),
            "0111": lambda: "4111" + h1(15 / 100 * 255),
            "0104": lambda: "4104" + h1(18 / 100 * 255),
            "0106": lambda: "4106" + trim(s["stft1"]),
            "0107": lambda: "4107" + trim(s["ltft1"]),
            "0108": lambda: "4108" + trim(5.1),
            "0109": lambda: "4109" + trim(7.9),
            "010B": lambda: "410B" + h1(99),
            "0110": lambda: "4110" + h2(480),
            "012F": lambda: "412F" + h1(62 / 100 * 255),
            "0114": lambda: "4114" + h1(s["o2"] * 200) + "FF",
            "0115": lambda: "4115" + h1(0.68 * 200) + "FF",
            "0142": lambda: "4142" + h2(self.battery() * 1000),
            "0123": lambda: "4123" + h2(386 / 10),
            "010E": lambda: "410E" + h1((8 + 64) * 2),
            "0133": lambda: "4133" + h1(101),
            "0103": lambda: "41030200",
            "0101": lambda: "41018207E504",
            "011C": lambda: "411C01",
            "011F": lambda: "411F" + h2(uptime_s()),
        }


def support_mask(cmd, pids):
    if len(cmd) != 4 or not cmd.startswith("01") or cmd[2:] not in ("00", "20", "40", "60", "80", "A0", "C0", "E0"):
        return None
    base = int(cmd[2:], 16)
    nums = [int(k[2:], 16) for k in pids]
    if base > 0 and not any(n > base for n in nums):
        return None
    mask = 0
    for n in nums:
        if base < n <= base + 0x20:
            mask |= 1 << (0x20 - (n - base))
    if any(n > base + 0x20 for n in nums):
        mask |= 1
    return f"41{cmd[2:]}{mask:08X}"


def mode09(cmd):
    def frames(t, data):
        return "\r".join(
            "49" + h1(t) + h1(i // 4 + 1) + "".join(h1(b) for b in data[i:i + 4])
            for i in range(0, len(data), 4))

    def text(s, w):
        return [ord(s[i]) if i < len(s) else 0 for i in range(w)]

    return {
        "0900": "49000154000000",
        "0902": frames(0x02, [0, 0, 0] + text(VIN, 17)),
        "0904": frames(0x04, text(CALID, 16)),
        "0906": frames(0x06, CVN),
    }.get(cmd)


def respond(raw, engine):
    cmd = raw.strip().upper().replace(" ", "")
    if cmd in ("ATZ", "ATI"):
        return "ELM327 v1.5"
    if cmd == "ATDP":
        return "SAE J1850 VPW"
    if cmd == "STI":
        return "UNO Q ELM327 emulator v1.0"
    if cmd == "STDI":
        return "Arduino UNO Q (Tattlestone) - emulated adapter"
    if cmd == "ATRV":
        return f"{engine.battery():.2f}V"
    if cmd.startswith(("AT", "ST")):
        return "OK"
    if cmd == "04":
        return "?"  # read-only: never clear codes
    if cmd == "03":
        return "4399820300"  # B1982, P0300
    if cmd == "07":
        return "47C1000000"  # U0100
    if cmd == "0A":
        return "4A0000"
    pids = engine.pids()
    mask = support_mask(cmd, pids)
    if mask:
        return mask
    info = mode09(cmd)
    if info:
        return info
    fn = pids.get(cmd)
    if fn:
        engine.tick()
        return fn()
    return "NO DATA"


def handle(client, addr):
    engine = Engine()
    print(f"Client {addr[0]} connected", flush=True)
    buf = b""
    try:
        while True:
            data = client.recv(512)
            if not data:
                break
            buf += data
            while b"\r" in buf:
                line, buf = buf.split(b"\r", 1)
                line = line.replace(b"\n", b"").decode("ascii", "replace")
                if not line.strip():
                    continue
                client.sendall((respond(line, engine) + "\r\r>").encode("ascii"))
    except OSError as e:
        print(f"Link error: {e}", flush=True)
    finally:
        client.close()
        print(f"Client {addr[0]} disconnected", flush=True)


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=35000)
    a = p.parse_args()
    server = socket.create_server((a.host, a.port))
    t = soc_temp_c()
    print(f"ELM327 emulator listening on {a.host}:{a.port}"
          f" (SoC {t:.1f} C)" if t is not None else f"ELM327 emulator listening on {a.host}:{a.port}", flush=True)
    while True:
        client, addr = server.accept()
        client.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        threading.Thread(target=handle, args=(client, addr), daemon=True).start()


if __name__ == "__main__":
    main()
