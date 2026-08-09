import { ELM327Commander } from './elm327Commander';
import { PcmField, PcmFieldGroup, PcmIdentity } from '../shared/types';

// ─── GM PCM identity over J1850 VPW (Mode 3C) ────────────────────────────────
//
// Block IDs and the request/response framing below are derived from PcmHammer
// (GPL-3.0): Apps/PcmLibrary/Messages/BlockId.cs and Docs/Read_ID_Commands.txt.
// Applies to the GM P01/P59-family PCMs used in 99-07 trucks — the GMT800
// platform this app targets.
//
// Framing:
//   request   6C 10 F0   3C <block>       priority / to PCM / from tool
//   response  6C F0 10   7C <block> <data...>
//
// This is a READ-ONLY surface. PcmHammer's reason for existing is flashing
// (kernel upload, segment write, recovery); none of that is implemented here,
// because a diagnostics tab has no business holding a write primitive that can
// brick an ECU.

const PCM_HEADER = '6C 10 F0';   // to PCM (0x10) from tool (0xF0)
const TOOL_ID    = 'F0';
const MODE_3C    = '3C';
const RESP_3C    = '7C';

// The PCM answers ID blocks fast; a slow reply means "unsupported", not "busy".
const BLOCK_TIMEOUT_MS = 1200;

export type PcmFieldFormat = 'ascii' | 'uint' | 'hex' | 'percent';

interface BlockDef {
  block: number;
  key: string;
  label: string;
  format: PcmFieldFormat;
  group: PcmFieldGroup;
}

/** VIN and serial arrive in fixed-width chunks that concatenate into one value. */
const COMPOSITE: Array<{ key: string; label: string; group: PcmFieldGroup; blocks: number[] }> = [
  { key: 'vin',    label: 'VIN',           group: 'identity', blocks: [0x01, 0x02, 0x03] },
  { key: 'serial', label: 'PCM serial',    group: 'identity', blocks: [0x05, 0x06, 0x07] },
];

const BLOCKS: BlockDef[] = [
  { block: 0x04, key: 'hardwareId',   label: 'Hardware ID',              format: 'uint', group: 'identity' },
  { block: 0x14, key: 'bcc',          label: 'Broadcast code (BCC)',     format: 'ascii', group: 'identity' },

  { block: 0x0A, key: 'osid',         label: 'Operating system ID',      format: 'uint', group: 'calibration' },
  { block: 0x08, key: 'calId',        label: 'Calibration ID',           format: 'uint', group: 'calibration' },
  { block: 0x0B, key: 'engineCal',    label: 'Engine calibration',       format: 'uint', group: 'calibration' },
  { block: 0x0C, key: 'engineDiag',   label: 'Engine diagnostic cal',    format: 'uint', group: 'calibration' },
  { block: 0x0D, key: 'transCal',     label: 'Transmission calibration', format: 'uint', group: 'calibration' },
  { block: 0x0E, key: 'transDiag',    label: 'Transmission diagnostic',  format: 'uint', group: 'calibration' },
  { block: 0x0F, key: 'fuelCal',      label: 'Fuel system calibration',  format: 'uint', group: 'calibration' },
  { block: 0x10, key: 'systemCal',    label: 'System calibration',       format: 'uint', group: 'calibration' },
  { block: 0x11, key: 'speedCal',     label: 'Speedometer calibration',  format: 'uint', group: 'calibration' },

  { block: 0x93, key: 'osLevel',      label: 'Operating system level',       format: 'uint', group: 'level' },
  { block: 0x94, key: 'engineCalLvl', label: 'Engine calibration level',     format: 'uint', group: 'level' },
  { block: 0x95, key: 'engineDiagLvl',label: 'Engine diagnostic level',      format: 'uint', group: 'level' },
  { block: 0x96, key: 'transCalLvl',  label: 'Transmission cal level',       format: 'uint', group: 'level' },
  { block: 0x97, key: 'transDiagLvl', label: 'Transmission diag level',      format: 'uint', group: 'level' },
  { block: 0x98, key: 'fuelCalLvl',   label: 'Fuel calibration level',       format: 'uint', group: 'level' },
  { block: 0x99, key: 'systemCalLvl', label: 'System calibration level',     format: 'uint', group: 'level' },
  { block: 0x9A, key: 'speedCalLvl',  label: 'Speed calibration level',      format: 'uint', group: 'level' },

  { block: 0x6D, key: 'oilLife',      label: 'Oil life remaining',       format: 'percent', group: 'service' },
  { block: 0xA0, key: 'mec',          label: 'Manufacturer enable counter', format: 'uint', group: 'service' },
];

export const PCM_BLOCK_COUNT = BLOCKS.length + COMPOSITE.reduce((n, c) => n + c.blocks.length, 0);

const hex2 = (n: number): string => n.toString(16).toUpperCase().padStart(2, '0');

/**
 * Pull the payload bytes out of a Mode 3C reply.
 * Returns null when the PCM did not answer this block, which is the normal
 * signal that a given ID is unsupported on this calibration.
 */
export function parseBlockResponse(block: number, raw: string): number[] | null {
  const clean = raw.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
  if (!clean) return null;

  const marker = RESP_3C + hex2(block);
  const idx = clean.indexOf(marker);
  if (idx === -1) return null;

  const payload = clean.substring(idx + marker.length);
  const bytes: number[] = [];
  for (let i = 0; i + 1 < payload.length; i += 2) {
    const b = parseInt(payload.substring(i, i + 2), 16);
    if (Number.isNaN(b)) break;
    bytes.push(b);
  }
  return bytes.length ? bytes : null;
}

export function formatBlock(bytes: number[], format: PcmFieldFormat): string {
  switch (format) {
    case 'ascii':
      // Blocks are zero-padded to a fixed width; drop padding and any control bytes.
      return bytes
        .filter(b => b >= 0x20 && b <= 0x7e)
        .map(b => String.fromCharCode(b))
        .join('')
        .trim();
    case 'uint':
      // Big-endian. Beyond 6 bytes this would exceed the safe integer range, so
      // fall back to hex rather than report a rounded number.
      if (bytes.length > 6) return bytes.map(hex2).join(' ');
      return String(bytes.reduce((acc, b) => acc * 256 + b, 0));
    case 'percent':
      return bytes.length ? `${bytes[0]}%` : '';
    case 'hex':
    default:
      return bytes.map(hex2).join(' ');
  }
}

export class PcmDiagnostics {
  constructor(private elm: ELM327Commander) {}

  /**
   * Put the adapter into raw VPW mode addressed at the PCM. The caller must
   * have stopped PID polling first: headers-on breaks parsePIDResponse, and the
   * request header targets the PCM rather than the broadcast address.
   */
  private async enterIdMode(): Promise<void> {
    await this.elm.send('ATSP2', 2000);       // force SAE J1850 VPW
    await this.elm.send('ATAL', 1000);        // allow long (>7 byte) messages
    await this.elm.send('ATH1', 1000);        // headers on, so we can match 7C
    await this.elm.send(`ATSR ${TOOL_ID}`, 1000); // only accept replies aimed at the tool
    await this.elm.send(`ATSH ${PCM_HEADER}`, 1000);
  }

  /** Undo enterIdMode so the normal PID poll loop still works afterwards. */
  private async restoreNormalMode(): Promise<void> {
    await this.elm.send('ATH0', 1000);   // headers off
    await this.elm.send('ATAR', 1000);   // automatic receive address
    await this.elm.send('ATSP0', 2000);  // back to auto protocol detection
  }

  private async readBlock(block: number): Promise<number[] | null> {
    const resp = await this.elm.send(`${MODE_3C} ${hex2(block)}`, BLOCK_TIMEOUT_MS);
    if (!resp.success) return null;
    if (/NO DATA|UNABLE TO CONNECT|STOPPED|CAN ERROR|BUS/i.test(resp.raw)) return null;
    return parseBlockResponse(block, resp.raw);
  }

  /**
   * Read every supported ID block. Unsupported blocks come back as fields with
   * supported:false rather than being dropped, so the UI can show what this
   * particular calibration does and does not expose.
   */
  async readIdentity(onProgress?: (done: number, total: number) => void): Promise<PcmIdentity> {
    await this.enterIdMode();
    let done = 0;
    const bump = () => onProgress?.(++done, PCM_BLOCK_COUNT);

    try {
      const fields: PcmField[] = [];

      for (const composite of COMPOSITE) {
        const parts: string[] = [];
        const rawParts: string[] = [];
        let any = false;
        for (const block of composite.blocks) {
          const bytes = await this.readBlock(block);
          bump();
          if (bytes) {
            any = true;
            parts.push(formatBlock(bytes, 'ascii'));
            rawParts.push(bytes.map(hex2).join(''));
          }
        }
        const value = parts.join('');
        fields.push({
          key: composite.key,
          label: composite.label,
          group: composite.group,
          value: any && value ? value : null,
          raw: rawParts.length ? rawParts.join(' ') : null,
          supported: any,
        });
      }

      for (const def of BLOCKS) {
        const bytes = await this.readBlock(def.block);
        bump();
        fields.push({
          key: def.key,
          label: def.label,
          group: def.group,
          value: bytes ? formatBlock(bytes, def.format) : null,
          raw: bytes ? bytes.map(hex2).join(' ') : null,
          supported: bytes !== null,
        });
      }

      return { fields, readAt: Date.now(), protocol: 'SAE J1850 VPW' };
    } finally {
      // Always hand the bus back, including when a block read throws.
      await this.restoreNormalMode();
    }
  }
}
