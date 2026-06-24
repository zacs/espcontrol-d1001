# Desloppify Cleanup Backlog

This review found a generally well-tested project with a good generated-file
ownership model. The main theme is that the project has outgrown a few early
"just make it work" areas: low-level web server safety, large feature files,
duplicated option rules between web and firmware, and device-specific flags
spread across YAML.

## Current Status

Completed in `jtenniswood/desloppify-cleanup`:

- Critical web server memory and partial POST handling fixes.
- Card-owned normalization for vacuum and lawn mower mode cards, backed by a
  shared helper.
- Shared web/firmware option-name generation for most duplicated config keys.
- Shared firmware runtime accessors for generated option constants.
- Device build flag documentation, including the S3 source linker workaround
  found during compile validation.
- Persistent firmware update failure status in the web UI.
- Shared DOM helpers for disclosure chevrons and simple icon spans.
- Documentation for safer broad-review scans.

Still best treated as future backlog:

- Broader migration of every card type into card-owned normalizers.
- Deeper todo-card firmware consolidation.
- Splitting the largest web UI modules by responsibility.
- Wider removal of ad hoc `innerHTML` patterns beyond the touched areas.

## Critical Issues

### 1. Fix embedded web server buffer overruns [Done]

- Where: `components/web_server_idf/web_server_idf.cpp:276-277` and
  `components/web_server_idf/web_server_idf.cpp:540-544`.
- Why it matters: Both locations allocate a string of `length` bytes and then
  write `length + 1` bytes into it. On a desktop app this would be a serious
  bug; on an ESP device it can corrupt nearby memory and cause random crashes,
  failed requests, or security problems.
- Recommendation: Resize the buffers to include the null terminator, or write
  only into the allocated byte count and append the terminator safely. Add a
  small focused test or compile-time guard around the helper behaviour if
  possible.
- Safe to fix now: Yes. This is a targeted safety fix and should be first.
  Verify with a firmware compile and a web UI smoke check.

### 2. Harden HTTP request handling around partial POST reads [Done]

- Where: `components/web_server_idf/web_server_idf.cpp:274-289`.
- Why it matters: The form POST handler assumes one `httpd_req_recv` call reads
  the full request body. Network reads can be partial, so a valid request could
  be processed incomplete. That can produce strange configuration saves or make
  failures hard to reproduce.
- Recommendation: Read in a loop until `content_len` bytes have been received,
  and reject requests where the stream closes early. Keep the existing size
  limit.
- Safe to fix now: Yes, ideally together with item 1 because it is the same
  file and same risk area.

## Medium Cleanup Items

### 3. Split `normalizeButtonConfig` into card-owned normalizers [Started]

- Where: `src/webserver/modules/config_codec.js:12-220` and related card files
  under `src/webserver/types/`.
- Why it matters: One central function now knows detailed rules for almost
  every card type. Adding a card means touching this central function plus the
  card module, which makes regressions likely.
- Recommendation: Move per-card normalization into each card type module and
  have `config_codec.js` call a registered normalizer. Keep compatibility
  aliases, such as old weather/text sensor migrations, in one small migration
  section.
- Safe to fix now: Safe, but stage it. First add characterization tests for a
  few existing card configs, then move one or two low-risk card types before
  migrating the rest.
- Status: Started. Vacuum and lawn mower now use registered card-owned
  normalizers. Continue one card family at a time.

### 4. Generate or share option constants between web and firmware [Mostly Done]

- Where: `src/webserver/modules/config_codec.js:3-10`,
  `src/webserver/modules/config_codec.js:256-286`, and
  `components/espcontrol/button_grid_config.h:90-105`.
- Why it matters: Storage option names such as `state_labels`, `image_refresh`,
  `light_tabs`, and `cover_tabs` are duplicated in JavaScript and C++. A typo or
  rename in one side could silently break saved configurations.
- Recommendation: Extend the existing card contract generator so these option
  keys are emitted for both web and firmware from `common/config/card_contract.json`.
- Safe to fix now: Safe after item 3, or as a standalone generator cleanup if
  kept small. Run `npm run check:card-contract-outputs` and `npm run check:product`.
- Status: Mostly done. The contract generator now emits option names for web
  and firmware. `light_tabs` and `cover_tabs` remain local firmware literals
  because the S3 firmware hit an Xtensa literal-range linker limit during
  validation.

### 5. Reduce near-duplicate card modules for similar Home Assistant domains [Done]

- Where: `src/webserver/types/vacuum.js:1-120` and
  `src/webserver/types/lawn_mower.js:1-120`.
- Why it matters: These modules have the same shape: modes, default icons,
  badges, metadata, entity field, and mode selector behaviour. Future fixes may
  land in one and not the other.
- Recommendation: Introduce a small shared helper for "mode-based entity action
  cards" and keep only the domain-specific mode list and icon choices in each
  file.
- Safe to fix now: Safe after adding a focused web smoke assertion for both card
  types. This is cleanup, not urgent.
- Status: Done for vacuum and lawn mower via the shared entity mode card helper.

### 6. Consolidate the two todo-card firmware implementations [Started]

- Where: `components/espcontrol/button_grid_todo.h:62-120` and
  `components/espcontrol/button_grid_todo.h:687-745`, with more duplicated
  modal/request logic later in the same file.
- Why it matters: The lite and full todo implementations duplicate structures,
  constants, modal state, parsing, and timeout behaviour. Every todo fix needs
  to be applied twice or consciously skipped.
- Recommendation: Extract shared request state, modal cleanup, item parsing, and
  card context helpers. Keep only memory-size differences behind the lite/full
  compile flags.
- Safe to fix now: Wait unless todo work is already planned. This is firmware
  memory-sensitive and should be done with compile checks for all devices.
- Status: Started only for tiny shared helpers. The larger lite/full
  consolidation should remain a separate firmware PR.

### 7. Move device-specific build flags into generated or documented profiles [Done]

- Where: `devices/*/device/device.yaml`, for example
  `devices/esp32-p4-86/device/device.yaml:77-83` and
  `devices/guition-esp32-p4-jc8012p4a1/device/device.yaml:79-88`.
- Why it matters: Flags such as `ESPCONTROL_DISABLE_TODO`,
  `ESPCONTROL_MAX_GRID_SLOTS`, rebuild markers, and device boot-fix markers are
  scattered per device. It is hard to know which are still needed and easy to
  miss one when adding a device.
- Recommendation: Add a manifest-backed build flag section, or at minimum a
  documented table that explains each active flag, owning issue, affected
  devices, and removal condition.
- Safe to fix now: Safe as documentation first. Generating the flags should
  wait until the current firmware build matrix is stable.
- Status: Documentation done. Generating flags from profiles remains optional
  future work.

### 8. Break up the largest web UI modules

- Where: `src/webserver/modules/config_codec.js` (~2,100 lines),
  `src/webserver/modules/state.js` (~1,400 lines),
  `src/webserver/modules/settings_page.js` (~1,400 lines), and
  `src/webserver/modules/button_settings.js` (~1,200 lines).
- Why it matters: These files mix rendering, validation, persistence, migration,
  and event handling. They work today, but new settings and card types will keep
  increasing the chance of accidental side effects.
- Recommendation: Split by responsibility, not by arbitrary size: card
  normalization, firmware update state, settings section builders, and reusable
  field controls.
- Safe to fix now: Wait until after the critical web server fixes. Do this in
  small PRs with smoke checks after each move.

### 9. Improve firmware update failure visibility [Done]

- Where: `src/webserver/modules/api.js:493-531` and
  `src/webserver/modules/state.js:1320-1390`.
- Why it matters: Firmware install has several fallbacks and polling timers.
  When a download, upload, restart, or update-state poll fails, the user mostly
  sees a short banner. That can make device testing confusing.
- Recommendation: Keep a small visible history or final status reason for the
  update flow, including whether the failure happened during public firmware
  download, upload to device, restart wait, or version verification.
- Safe to fix now: Safe, but should be user-tested on at least one panel because
  update UX is high impact.
- Status: Done for persistent failure text in the web UI. Still worth
  user-testing during a real failed update path.

## Nice-To-Have Polish

### 10. Replace ad hoc `innerHTML` UI snippets with small element helpers [Started]

- Where: examples include `src/webserver/modules/button_settings.js:37-50`,
  `src/webserver/modules/button_settings.js:547-553`,
  `src/webserver/modules/settings_page.js:950-957`, and
  `src/webserver/modules/app.js:27`.
- Why it matters: Most dynamic values are escaped, which is good, but repeated
  string-built markup is harder to review and easier to get wrong later.
- Recommendation: Add helpers such as `iconButton(label, icon, className)` and
  `mdiSpan(icon)` that create DOM nodes with `textContent` for labels.
- Safe to fix now: Safe as a gradual cleanup when touching those UI areas.
- Status: Started for touched controls. Continue gradually.

### 11. Reduce handwritten inline SVG duplication for disclosure controls [Done]

- Where: `src/webserver/modules/controls_fields.js:14` and
  `src/webserver/modules/settings_page.js:55`.
- Why it matters: Small duplication is not dangerous, but it adds visual drift
  risk as the settings UI evolves.
- Recommendation: Use one shared disclosure chevron helper.
- Safe to fix now: Safe and low risk.
- Status: Done.

### 12. Keep generated and cache-like local folders out of broad scans [Done]

- Where: local folders such as `.cache/`, `.esphome/`, `.pio-core/`,
  `.uv-cache/`, and `.worktrees/` appear in broad `find` output.
- Why it matters: These folders are ignored by git, but broad review/check
  commands become noisy and make it easier to miss real files.
- Recommendation: Add or document standard review commands that exclude local
  caches and worktrees, for example `rg --files` with ignore rules.
- Safe to fix now: Safe as documentation/tooling polish.
- Status: Done in developer documentation.

## Quick Wins

- Fix the two web server buffer-size bugs.
- Make POST body reads loop until the advertised content length is received.
- Add one shared disclosure chevron helper.
- Document current device build flags and their purpose.

## Not Recommended Right Now

- A broad rewrite of the web configurator. The current generated-file contract
  and smoke checks are useful; keep them and improve one responsibility at a
  time.
- Removing generated files from the repo. The project intentionally publishes
  device-specific web bundles and documents the source-of-truth map.
- Reworking all firmware card files at once. The memory and compile matrix make
  that risky without a staged plan.

## Checks Run

- `npm run check:ci`: passed.
- Factory firmware compiles using local ESPHome 2026.6.2: passed for
  `esp32-p4-86`, `guition-esp32-p4-jc1060p470`,
  `guition-esp32-p4-jc4880p443`, `guition-esp32-p4-jc8012p4a1`, and
  `guition-esp32-s3-4848s040`.
- Docker-based ESPHome 2026.5.3 compile was attempted, but Docker Desktop's
  daemon was not available from this session.
