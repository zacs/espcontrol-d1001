# Tracking upstream espControl

This repo is a Seeed-focused fork of
[`jtenniswood/espcontrol`](https://github.com/jtenniswood/espcontrol). `main`
holds upstream's history plus this fork's additions (currently the Seeed
reTerminal D1001 device and its audio/battery packages), so upstream changes can
be pulled in by **merging** — not rebasing, which would rewrite the public
history and make future merges conflict badly.

## One-time setup

```sh
git remote add upstream https://github.com/jtenniswood/espcontrol
```

## Pull in the latest upstream changes

```sh
git fetch upstream
git checkout main
git merge upstream/main         # resolve any conflicts, then commit
python3 scripts/generate_device_slots.py   # regenerate generated device YAML
git push origin main            # CI rebuilds the D1001 firmware on push
```

Conflicts are usually limited to files this fork also edits:

- `devices/manifest.json` — the D1001 entry / `extraPackages`
- `devices/seeed-esp32-p4-reterminal-d1001/**` — the whole device dir
- `components/gsl3670/**` — the vendored touch driver
- `common/device/screen_cover_art.yaml` — the D1001 shares the jc8012 layout
- a few docs/registration spots (README table, `config.mts`, install selector,
  `pages.yml` optional-firmware slugs, `check_firmware_parser.py`)

Take upstream's side for shared files and re-apply the D1001 additions, or keep
this fork's side where the change is D1001-only.

## Optional: automate it

A scheduled workflow can `fetch upstream` and open a pull request with the merge
so you review before it lands on `main`, e.g. via
[`repo-sync/github-sync`](https://github.com/repo-sync/github-sync) or a small
`on: schedule` job running the commands above with `gh pr create`. Ask and it can
be added.
