---
name: pos-hardware
description: Integrate POS hardware from the Electron main process - Rongta RLS1000C label scale (RS-232/USB/Ethernet), serialport, Xprinter XP-58IIT receipt printer, XP-365B label printer (TSPL), barcode scanners, COM ports. Use whenever the task involves a scale, printer, serial port, COM port, weight, or label printing.
---

# Hardware integration rules (learned the hard way)

1. **Prove the data on the wire before writing integration code.** The RLS1000C is a label-printing scale; its serial or network port may support management traffic only, not continuous weight streaming. Ask the user to test with PuTTY (serial) or a TCP client and paste raw output. Do not assume streaming works.
2. Connection options for the scale: RS-232 via COM port (native COM1/COM2 or USB-serial adapter) or its RJ45 Ethernet port (TCP). Resolve which one works before building.
3. USB-serial adapters: genuine **FTDI FT232** or **Prolific PL2303** chips. Avoid CH340 clones for RS-232 scales.
4. Stack: `serialport` with `ReadlineParser` in the **main process**. First build a scaffold that logs raw bytes (hex and text) with timestamps; only then parse.
5. Robustness: open/close timeouts, auto-reconnect with backoff, handle unplugging, never block the main process, never crash a sale when hardware is missing (show a clear cashier message and allow manual entry).
6. Receipt printer (XP-58IIT): Windows printer name is saved in app Settings → Printer Settings; paper size `58×297mm` in Windows printer preferences.
7. Label printer (XP-365B): TSPL commands, sent on Windows with `COPY /B file \\localhost\<share>`; no SDK needed.
8. Config (port, baud, printer name) lives in app settings, not hard-coded, and is testable from a settings screen.
9. Tests: pure parsing/formatting logic gets `*.test.ts`; the hardware itself is tested by hand. Do not fake device behaviour, and say so when something is unverified.
