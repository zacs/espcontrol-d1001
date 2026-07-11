# EspControl for the Seeed reTerminal D1001

An **additive fork** of [**EspControl**](https://github.com/jtenniswood/espcontrol) by [Jonathan Tenniswood](https://github.com/jtenniswood): his firmware, unchanged, with first-class support for the **Seeed Studio reTerminal D1001** (8-inch ESP32-P4 panel) and a few device-specific extras layered on top. It's kept continuously in sync with upstream — nothing removed, only added — so you get the complete EspControl feature set plus the D1001 goodies.

All the core firmware (the drag-and-drop UI, card system, and architecture) is Jonathan's excellent work — please [⭐ star the upstream project](https://github.com/jtenniswood/espcontrol), where the real development happens.

## What this adds on top of upstream

- **Seeed reTerminal D1001** as a first-class screen — MIPI-DSI display, GSL3670 touch, physical button, ESP32-C6 Wi-Fi.
- **Battery & power** — level, voltage, charging, external-power, and power-outage sensors.
- **Speaker + media player** — cast TTS, announcements, and media to the panel (ES8311, on-device decode).
- **Microphone** — room-noise level and sound detection (ES7210).
- **Camera person detection** — on-device occupancy from the MIPI-CSI camera (ESP-DL), with IMU-assisted auto-rotation, via [esphome-person_detector](https://github.com/zacs/esphome-person_detector).
- **Build & release automation** — every push compiles a factory image; tagged releases ship a flashable `.bin`.

## Always in sync with upstream

`main` is upstream's history plus these additions and nothing else. A weekly job merges the latest [`jtenniswood/espcontrol`](https://github.com/jtenniswood/espcontrol) so the fork never drifts behind. Details in [`dev-docs/syncing-upstream.md`](dev-docs/syncing-upstream.md).

## Install

Download the latest `espcontrol-reterminal-d1001-*.factory.bin` from [**Releases**](https://github.com/zacs/espcontrol-d1001/releases) and flash it at offset `0x0` with any ESP Web Tools flasher (e.g. [web.esphome.io](https://web.esphome.io)). On first boot the panel opens an **"EspControl reTerminal D1001"** Wi-Fi hotspot for setup.

For general firmware usage — adding the panel to Home Assistant and configuring the screen — follow the [upstream documentation](https://jtenniswood.github.io/espcontrol/). D1001 hardware specifics are in [`docs/d1001-audio-battery.md`](docs/d1001-audio-battery.md).
