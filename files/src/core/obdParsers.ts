// ─── OBD response parsers ─────────────────────────────────────────────────────
//
// Pure functions that turn an ELM327 reply (ATH0, ATS0 or ATS1) into data.
// Every parser works on messages, never on the flattened reply: each line is
// one frame from one ECU, and a CAN ISO-TP reply (a length line, then "0:",
// "1:"… segments) is reassembled into a single message first. Flattening the
// reply mixed later frames' SID bytes into the data and invented codes.

export type Message = number[];

const hexBytes = (hex: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.substring(i, i + 2), 16));
  return out;
};

export function responseMessages(raw: string): Message[] {
  const lines = raw
    .split(/[\r\n]+/)
    .map(l => l.replace(/[\s>]/g, '').toUpperCase())
    .filter(Boolean);

  const messages: Message[] = [];
  let multi: { length: number; bytes: number[] } | null = null;

  for (const line of lines) {
    // ISO-TP length line: three hex digits, e.g. "014" for a 20-byte payload
    if (/^[0-9A-F]{3}$/.test(line)) {
      multi = { length: parseInt(line, 16), bytes: [] };
      continue;
    }
    const segment = /^[0-9A-F]:([0-9A-F]*)$/.exec(line);
    if (segment) {
      if (!multi) continue;
      multi.bytes.push(...hexBytes(segment[1]));
      if (multi.bytes.length >= multi.length) {
        messages.push(multi.bytes.slice(0, multi.length));
        multi = null;
      }
      continue;
    }
    // Anything else must be a whole frame of hex bytes; status text such as
    // SEARCHING..., BUS INIT: ...OK and NO DATA is dropped here.
    if (/^([0-9A-F]{2})+$/.test(line)) messages.push(hexBytes(line));
  }
  return messages;
}

// Replies that mean the request never got a real answer. NO DATA is not one:
// it means the bus worked and no ECU had anything to report.
const FAILURE = /UNABLE TO CONNECT|BUS ERROR|CAN ERROR|BUS BUSY|STOPPED|FB ERROR|DATA ERROR|BUFFER FULL|ERROR|^\?$/m;

// ── DTCs: Mode 03 (stored), 07 (pending), 0A (permanent) ─────────────────────

const DTC_TYPES = ['P', 'C', 'B', 'U'] as const;

export function decodeDTC(a: number, b: number): string {
  const type = DTC_TYPES[a >> 6];
  const digits = ((a & 0x3F) << 8 | b).toString(16).toUpperCase().padStart(4, '0');
  return type + digits;
}

export function parseDTCResponse(mode: string, raw: string): { ok: boolean; codes: string[] } {
  const sid = parseInt(mode, 16);
  const messages = responseMessages(raw);
  const positive = messages.filter(m => m[0] === sid + 0x40);
  // 7F <mode> <nrc>: the ECU does not support this mode — no codes of this kind
  const negative = messages.some(m => m[0] === 0x7F && m[1] === sid);

  if (positive.length === 0) {
    const text = raw.replace(/>/g, '').trim();
    const ok = negative || (/NO DATA/.test(text) && !FAILURE.test(text));
    return { ok, codes: [] };
  }

  const codes: string[] = [];
  for (const msg of positive) {
    let data = msg.slice(1);
    // CAN (ISO 15765) puts a DTC count before the codes, so its payload is
    // always 1 + 2n bytes. J1850 / ISO 9141 / KWP frames carry pairs only.
    if (data.length % 2 === 1 && data.length === 1 + 2 * data[0]) data = data.slice(1);
    for (let i = 0; i + 1 < data.length; i += 2) {
      if (data[i] === 0 && data[i + 1] === 0) continue;
      const code = decodeDTC(data[i], data[i + 1]);
      if (!codes.includes(code)) codes.push(code);
    }
  }
  return { ok: true, codes };
}

// ── VIN: Mode 09 PID 02 ───────────────────────────────────────────────────────

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export function parseVIN(raw: string): string | null {
  const replies = responseMessages(raw).filter(m => m[0] === 0x49 && m[1] === 0x02);
  if (replies.length === 0) return null;

  let bytes: number[];
  if (replies.every(m => m.length === 7)) {
    // J1850 / ISO 9141: five frames of 49 02 <seq> + 4 bytes, the first padded
    // with leading zeros. Order by sequence number, not arrival.
    bytes = [...replies].sort((x, y) => x[2] - y[2]).flatMap(m => m.slice(3));
  } else {
    // CAN: one reassembled payload, 49 02 <item count> + 17 bytes
    const payload = replies.find(m => m.length > 7);
    if (!payload) return null;
    bytes = payload.slice(3);
  }

  const vin = bytes.filter(b => b !== 0).map(b => String.fromCharCode(b)).join('').slice(-17);
  return VIN_PATTERN.test(vin) ? vin : null;
}

// ── Mode 01 PIDs ──────────────────────────────────────────────────────────────

// Data bytes from every ECU that answered this PID, in arrival order.
export function parsePIDMessages(pid: string, raw: string): number[][] {
  const sid = parseInt(pid.substring(0, 2), 16) + 0x40;
  const pidByte = parseInt(pid.substring(2), 16);
  return responseMessages(raw)
    .filter(m => m.length > 2 && m[0] === sid && m[1] === pidByte)
    .map(m => m.slice(2));
}

// Data bytes from the first ECU that answered, or null.
export function parsePIDData(pid: string, raw: string): number[] | null {
  return parsePIDMessages(pid, raw)[0] ?? null;
}
