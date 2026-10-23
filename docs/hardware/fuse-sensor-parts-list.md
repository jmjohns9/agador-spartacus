# Fuse-Sensor Kit — Parts List

Hardware for adding **measured** parasitic-draw data to Tattlestone. The Arduino UNO Q reads current through one fuse slot (and battery voltage) with an INA260 sensor, and relays it to the Mac app alongside OBD data over Network Mode.

> Status: proposed. The firmware and app changes to carry sensor readings are not built yet. Today the fuse map on the Parasitic Draw screen is updated by hand.

```
Fuse slot ──► fuse test lead ──► inline fuse ──► INA260 (IN+ → IN−) ──► back to fuse slot
                                                     │  └─ TVS diode across 12 V and ground
                                                     │
                                          Qwiic cable (I2C, 3.3 V)
                                                     │
OBD port ──► OBDLink MX+ ──Bluetooth──► Arduino UNO Q ──Wi-Fi :35000──► Mac (Tattlestone)
                                             ▲
                                     USB-C power bank
```

## Parts

| # | Part | Qty | ~Price | Why it's needed | What it does | Data it collects | Supplier |
|---|---|---|---|---|---|---|---|
| 1 | **Arduino UNO Q (2 GB)** | 1 | €59.90 | The in-vehicle hub that links the sensor, the OBD adapter and the Mac | Linux side runs the TCP bridge/emulator; microcontroller side reads the sensor over I2C | None itself; collects and forwards everything below (also reports its own temperature and uptime in emulator mode) | [Arduino Store](https://store.arduino.cc/products/uno-q) |
| 2 | **OBDLink MX+** | 1 | $139.95 | Talks to the truck's computers on the J1850 VPW / GM-LAN bus | Bluetooth OBD-II adapter; the UNO Q bridges it to the Mac | **Yes:** live PIDs (RPM, temps, trims, voltage), fault codes, freeze frames, VIN, module wake states | [OBDLink](https://www.obdlink.com/products/obdlink-mxp/) |
| 3 | **Adafruit INA260 current/voltage sensor** | 1 | $9.95 | Turns the manual "pull a fuse and watch a meter" test into a measured reading | Current flows through its built-in, factory-calibrated shunt; it reports amps, volts and watts over I2C. 36 V / 15 A max, 1.25 mA steps | **Yes:** current through the tested fuse circuit (mA), battery/bus voltage (V), power (mW) | [Adafruit #4226](https://www.adafruit.com/product/4226) |
| 3b | *Alternative:* INA226 module, 36 V / 20 A | 1 | $12.88 | Same role if you prefer a 20 A limit | Same as above, but with an external shunt (check for an "R002" marking) and soldered headers | Same as #3 | [Amazon](https://www.amazon.com/dp/B0DRNG1VKM) |
| 4 | **STEMMA QT / Qwiic cable, 100 mm** | 1 | $0.95 | Connects the sensor to the UNO Q without soldering | Carries 3.3 V power, ground and I2C (SDA/SCL) | None (data path only) | [Adafruit #4210](https://www.adafruit.com/product/4210) |
| 5 | **Fuse-slot test lead, 14 AWG** | 1 | $10–20 | Puts the sensor *in series* with a fuse circuit. An "add-a-circuit" tap will **not** do this | Plugs into an empty fuse slot; one wire per blade terminal brings the circuit out to the sensor | None | [Amazon search](https://www.amazon.com/s?k=fuse+buddy+test+lead+14+awg) |
| 6 | **Inline fuse holder (ATO/ATC or mini), 14 AWG** | 1 | $5–10 | Protects the sensor and wiring while the factory fuse is pulled | Holds a fuse rated **no higher** than the slot's original fuse (and ≤ 15 A for the INA260) | None | [Amazon search](https://www.amazon.com/s?k=inline+blade+fuse+holder+14+awg) |
| 7 | **Blade fuse assortment (match your fuse box)** | 1 set | $5–10 | Fuses for the inline holder: start with 2–5 A for key-off drain tests | Opens the circuit if a module wakes up and pulls more than expected | None | [Amazon search](https://www.amazon.com/s?k=blade+fuse+assortment+mini+ato) |
| 8 | **TVS diode, P6KE22A (through-hole)** | 2 | ~$0.50 | Car voltage spikes can exceed the sensor's 36 V limit | Clamps spikes to about 30 V across the 12 V supply and ground. Same rating as the SMBJ18A, but easier to hand-solder | None | [Digi-Key](https://www.digikey.com/en/products/result?keywords=P6KE22A) |
| 9 | **USB-C power bank (≥ 15 W, 5 V / 3 A)** | 1 | $25–40 | Runs the UNO Q overnight without adding its own load to the truck battery being tested | Powers the Arduino independently of the vehicle | None | [Amazon search](https://www.amazon.com/s?k=usb-c+power+bank+20000mah+pd) |
| 10 | **Small enclosure + ring terminal for chassis ground** | 1 | $5–10 | Keeps the boards from shorting on metal in the cab; ties sensor ground to the truck | Mechanical protection; common ground so the voltage readings are valid | None | [Amazon search](https://www.amazon.com/s?k=abs+project+enclosure+small) |

**Approximate total:** about $270–330 with the OBDLink MX+, or about $130–190 if you already have the adapter.

## What data reaches the app

| Source | Reading | Rate | Where it would show in Tattlestone |
|---|---|---|---|
| OBDLink MX+ (via UNO Q) | Live PIDs, DTCs, VIN, module states | Existing polling loop | All current screens (unchanged) |
| INA260 | Fuse-circuit current (mA) | ~1 Hz, averaged | Fuse map on the Parasitic Draw screen (**new**) |
| INA260 | Battery voltage (V) | ~1 Hz | Battery voltage timeline (replaces the emulator's simulated drift) |
| UNO Q | SoC temperature, uptime | On request | Emulator mode only (ambient temp / run time PIDs) |

## Safety rules

- Measure **with the key off**. That's when the drain happens.
- The inline fuse must be **≤ the original fuse rating** and **≤ 15 A** with the INA260.
- Fit the TVS diode before the first connection to the truck.
- Connect the sensor's ground to chassis ground; check polarity before plugging in the test lead.
- Tattlestone stays read-only: the sensor only measures, and the bridge still blocks Mode 04 (clear DTCs).
