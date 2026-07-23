# Hardware-in-the-loop (HIL) testing — reTerminal D1001

Tier 1: **flash + boot/soak smoke test** on a real D1001 attached to a Docker
host. Catches runtime crash-loops and boot failures that the compile-only CI
gate can't — the exact class of bug that a cover-art / lifecycle regression
produces.

## How it fits together

```
GitHub Actions ──(outbound poll)── self-hosted runner (this Docker host)
                                        │  USB ──> D1001 unit
```

- The runner connects **out** to GitHub and pulls jobs. The device is **never
  exposed to the internet** — no port-forwarding, no inbound surface.
- The `HIL smoke test` workflow (`.github/workflows/hil-smoke.yml`) runs on the
  `d1001-hil` runner, downloads a factory `.bin`, flashes it with `esptool`, and
  runs `scripts/hil_smoke.py` to assert the device **boots and stays up** with no
  crash/reboot during a soak window.
- **It can't brick the unit:** USB flashing doesn't depend on the running
  firmware, so the next run always recovers a bad flash.

## One-time setup

1. **Create a PAT** for runner registration — classic with `repo` scope, or
   fine-grained scoped to this repo with *Administration: Read/Write* and
   *Actions: Read/Write*.

2. **Configure and start the runner:**
   ```bash
   cd hil
   cp .env.example .env
   # edit .env: ACCESS_TOKEN, HIL_SERIAL_PORT, SERIAL_GID
   docker compose up -d
   docker compose logs -f runner     # watch it register
   ```
   Confirm it appears under **Settings → Actions → Runners** with the
   `d1001-hil` label and status *Idle*.

3. **Tell the workflow which port to use** — add a repo **variable** (not a
   secret) under *Settings → Secrets and variables → Actions → Variables*:
   `HIL_SERIAL_PORT = /dev/ttyUSB0` (or your device's node).

## Running it

*Actions → HIL smoke test (reTerminal D1001) → Run workflow.* Optional inputs:

- **firmware_url** — defaults to the latest release's factory image. Point it at
  any release asset or a build-artifact URL to smoke-test a specific build.
- **soak_seconds** — how long to watch for reboots/crashes after boot (default 90).

The captured serial log is uploaded as the `hil-serial-log` artifact on every
run (pass or fail). On failure the job also prints the crash reason and the last
serial lines inline.

Run it by hand on the host to debug:
```bash
python3 scripts/hil_smoke.py --firmware out/firmware.factory.bin \
    --port /dev/ttyUSB0 --chip esp32p4 --soak 90 --log out/serial.log
# already-flashed device, just watch it:
python3 scripts/hil_smoke.py --no-flash --port /dev/ttyUSB0
```

## What "pass" means

All of:
- the ESPHome boot banner appeared (our image booted → flash was good),
- no crash/panic markers on serial during the soak, and
- no reboot after first boot (no crash-loop).

## Native-USB caveat (important)

If the D1001's USB is a **USB-UART bridge** (CP210x/CH34x), the serial node is
stable — the default `devices:` passthrough in `docker-compose.yml` works as-is.

If it enumerates as **native USB-serial-JTAG**, the device **re-enumerates on
every reset**, so a fixed `/dev/ttyXXX` node disappears mid-run. In that case:

- In `docker-compose.yml`, comment out the `devices:`/`group_add:` block and use
  the `privileged: true` + `/dev/bus/usb` volume shown there instead.
- Set `HIL_SERIAL_PORT` to a **stable** path, e.g.
  `/dev/serial/by-id/usb-Espressif_*-if00` (find it with `ls -l /dev/serial/by-id/`).
- For maximum reliability, a USB hub with per-port power control lets you
  power-cycle a wedged bootloader between runs.

## Security

- The HIL workflow is **`workflow_dispatch`-only**. Do **not** add a
  `pull_request` trigger from forks — that would run untrusted code on a runner
  physically attached to your hardware and network.
- Widening to auto-run after a build is fine via `workflow_run` on `main` (a
  trusted, already-merged ref); keep the fork-PR guard.

## Roadmap

- **Tier 2** — scripted API assertions via `aioesphomeapi` (read sensors, call
  services, verify entities).
- **Tier 3** — the full "next track" cover-art repro (needs a media source /
  mock artwork server).
