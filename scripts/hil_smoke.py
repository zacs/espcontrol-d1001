#!/usr/bin/env python3
"""Hardware-in-the-loop (HIL) Tier-1 smoke test for the reTerminal D1001.

Flashes a factory image to a physically-attached ESP32-P4 over USB, then
watches the serial console to assert the device actually *boots and stays up*
- the class of failure (crash / boot-loop at runtime) that a compile-only CI
gate cannot catch.

Pass criteria (all must hold):
  * the ESPHome boot banner is seen (our image booted -> flash was good),
  * no crash/panic markers appear during the soak window, and
  * the device does not reboot after it first booted (no crash-loop).

A device can't be permanently bricked by this: USB flashing does not depend on
the running firmware, so the next run always recovers it.

Usage (typically invoked by .github/workflows/hil-smoke.yml on a self-hosted
runner, but runnable by hand):

    python3 scripts/hil_smoke.py --firmware out/firmware.factory.bin \
        --port /dev/ttyUSB0 --chip esp32p4 --soak 90 --log out/serial.log

Requires: esptool, pyserial  (pip install esptool pyserial)
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

# `serial` (pyserial) is imported lazily inside open_serial() so that --help and
# argument validation work even where the dependency isn't installed.

# The ESPHome application banner - proof our firmware (not just the ROM) booted.
BOOT_BANNER = re.compile(r"ESPHome version", re.IGNORECASE)

# ESP-IDF second-stage boot markers. Seeing one of these *after* the app has
# already booted means the chip reset - i.e. a crash-reboot.
RESET_BANNER = re.compile(r"ESP-ROM:|rst:0x[0-9a-fA-F]+", re.IGNORECASE)

# Runtime crash / corruption signatures. Any of these fails the run immediately.
CRASH_MARKERS = (
    "Guru Meditation Error",
    "abort() was called",
    "Stack canary watchpoint triggered",
    "CORRUPT HEAP",
    "assert failed",
    "Backtrace:",
    "StoreProhibited",
    "LoadProhibited",
    "IntegerDivideByZero",
    "InstrFetchProhibited",
    "Cache disabled but cached memory region accessed",
    "invalid header",  # a bad/truncated flash image
)


def annotate(level: str, message: str) -> None:
    """Emit a GitHub Actions annotation (and a plain line for local runs)."""
    print(f"::{level}::{message}")


def flash(chip: str, port: str, baud: int, firmware: Path) -> None:
    """Write the merged factory image at offset 0x0 and hard-reset into it."""
    if not firmware.is_file():
        raise SystemExit(f"::error::firmware not found: {firmware}")
    size = firmware.stat().st_size
    print(f"Flashing {firmware} ({size} bytes) to {chip} on {port} @ {baud} baud")
    if size < 1_048_576:
        raise SystemExit(f"::error::firmware is only {size} bytes (<1 MiB) - refusing to flash a truncated image")
    cmd = [
        sys.executable, "-m", "esptool",
        "--chip", chip,
        "--port", port,
        "--baud", str(baud),
        "--before", "default_reset",
        "--after", "hard_reset",
        "write_flash", "--flash_size", "keep", "0x0", str(firmware),
    ]
    print("+ " + " ".join(cmd))
    result = subprocess.run(cmd)
    if result.returncode != 0:
        raise SystemExit(f"::error::esptool flash failed (exit {result.returncode})")
    print("Flash complete; device hard-reset into the new image.")


def open_serial(port: str, baud: int, attempts: int = 30, delay: float = 0.5):
    """Open the serial port, retrying while a native-USB device re-enumerates."""
    try:
        import serial  # pyserial
    except ImportError:  # pragma: no cover - dependency guard
        raise SystemExit("::error::pyserial is not installed (pip install pyserial)")
    last_err: Exception | None = None
    for _ in range(attempts):
        try:
            return serial.Serial(port, baud, timeout=1)
        except (serial.SerialException, OSError) as exc:  # port not back yet
            last_err = exc
            time.sleep(delay)
    raise SystemExit(f"::error::could not open serial port {port}: {last_err}")


def monitor(port: str, baud: int, boot_timeout: float, soak: float, log_path: Path) -> int:
    """Watch the console; return process exit code (0 = pass)."""
    ser = open_serial(port, baud)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log = log_path.open("w", encoding="utf-8", errors="replace")

    booted = False
    booted_at = 0.0
    start = time.monotonic()
    boot_deadline = start + boot_timeout
    # The soak clock starts once we see the boot banner; until then we're only
    # bounded by boot_timeout.
    fail_reason: str | None = None

    try:
        while True:
            now = time.monotonic()
            if not booted and now >= boot_deadline:
                fail_reason = f"device did not boot within {boot_timeout:.0f}s (no ESPHome banner)"
                break
            if booted and now >= booted_at + soak:
                break  # survived the full soak window

            raw = ser.readline()
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
            if not line:
                continue
            log.write(line + "\n")
            log.flush()
            print(line)

            for marker in CRASH_MARKERS:
                if marker in line:
                    fail_reason = f"crash marker on serial: {marker!r}"
                    break
            if fail_reason:
                break

            if BOOT_BANNER.search(line):
                if booted:
                    fail_reason = "device rebooted after booting (crash-loop) - saw a second ESPHome banner"
                    break
                booted = True
                booted_at = now
                print(f"-- boot banner seen at t+{now - start:.1f}s; soaking {soak:.0f}s --")
                continue

            # A bootloader reset banner after we already booted == crash-reboot.
            if booted and RESET_BANNER.search(line):
                fail_reason = "device reset after booting (crash-loop) - saw a bootloader reset banner"
                break
    finally:
        ser.close()
        log.close()

    if fail_reason:
        annotate("error", f"HIL smoke test FAILED: {fail_reason}")
        _print_tail(log_path)
        return 1
    if not booted:
        annotate("error", "HIL smoke test FAILED: device never produced the ESPHome boot banner")
        _print_tail(log_path)
        return 1

    print(f"HIL smoke test PASSED: booted and stayed up for {soak:.0f}s with no crash or reboot.")
    return 0


def _print_tail(log_path: Path, lines: int = 40) -> None:
    try:
        tail = log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:]
    except OSError:
        return
    print("--- last serial lines ---")
    for line in tail:
        print(line)
    print("--- end serial ---")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--firmware", type=Path, help="factory .bin to flash (omit with --no-flash)")
    parser.add_argument("--port", default="/dev/ttyUSB0", help="serial port of the device")
    parser.add_argument("--chip", default="esp32p4", help="esptool chip name")
    parser.add_argument("--flash-baud", type=int, default=460800, help="baud for flashing")
    parser.add_argument("--monitor-baud", type=int, default=115200, help="baud for the console")
    parser.add_argument("--boot-timeout", type=float, default=45.0,
                        help="seconds to wait for the boot banner before failing")
    parser.add_argument("--soak", type=float, default=90.0,
                        help="seconds to watch for crashes/reboots after boot")
    parser.add_argument("--log", type=Path, default=Path("out/serial.log"),
                        help="where to write the captured serial log")
    parser.add_argument("--no-flash", action="store_true",
                        help="skip flashing; just monitor an already-running device")
    args = parser.parse_args()

    if not args.no_flash:
        if args.firmware is None:
            raise SystemExit("::error::--firmware is required unless --no-flash is given")
        flash(args.chip, args.port, args.flash_baud, args.firmware)
        # Give a native-USB device a moment to re-enumerate after the reset.
        time.sleep(2)

    return monitor(args.port, args.monitor_baud, args.boot_timeout, args.soak, args.log)


if __name__ == "__main__":
    sys.exit(main())
