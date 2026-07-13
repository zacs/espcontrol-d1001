#!/usr/bin/env node
"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadTypeScriptModule } = require("./load_typescript_module");

const ROOT = path.resolve(__dirname, "..");

function compiler() {
  for (const candidate of [process.env.CXX, "c++", "g++", "clang++"].filter(Boolean)) {
    if (childProcess.spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0) return candidate;
  }
  throw new Error("No C++ compiler found for saved-config production check");
}

function checkCompiledHelper() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "espcontrol-saved-config-production-"));
  try {
    const source = path.join(temporary, "saved_config_vacuum.cpp");
    const binary = path.join(temporary, "saved_config_vacuum");
    fs.writeFileSync(source, `
#include <cassert>
#include <string>
#include "button_grid_saved_config_action_generated.h"
#include "button_grid_saved_config_media_generated.h"
#include "button_grid_saved_config_sensor_generated.h"
#include "button_grid_saved_config_static_generated.h"
#include "button_grid_saved_config_vacuum_generated.h"
struct Config {
  std::string type;
  std::string sensor;
  std::string unit;
  std::string precision;
  std::string options;
  std::string icon_on;
  std::string entity;
  std::string label;
  std::string icon;
};
int main() {
  Config local_action{"local", "stale", "unit", "2", "unknown=1", "Custom", "", "", ""};
  assert(migrate_saved_config_action_legacy(local_action));
  assert(local_action.type == "action" && local_action.sensor == "local");
  assert(local_action.unit.empty() && local_action.precision.empty() && local_action.options.empty());
  assert(local_action.icon_on == "Auto");
  Config option_select{"option_select", "stale", "unit", "2", "unknown=1", "Custom", "", "", ""};
  assert(migrate_saved_config_action_legacy(option_select));
  assert(option_select.type == "action" && option_select.sensor == "input_select.select_option");
  assert(option_select.unit.empty() && option_select.precision.empty() && option_select.options.empty());
  assert(option_select.icon_on == "Auto");
  Config regular_action{"action", "scene.turn_on", "", "", "", "Auto", "", "", ""};
  assert(!migrate_saved_config_action_legacy(regular_action));
  bool action_fields_called = false;
  bool action_options_called = false;
  regular_action.precision = "2";
  regular_action.options = "unknown=1";
  assert(normalize_saved_config_action(
    regular_action,
    [&](Config &config) {
      action_fields_called = true;
      config.precision.clear();
    },
    [&](const std::string &options, const std::string &action) {
      action_options_called = action == "scene.turn_on";
      return options + "option-hook";
    }
  ));
  assert(action_fields_called && action_options_called);
  assert(regular_action.precision.empty() && regular_action.options == "unknown=1option-hook");
  Config media{"media", "controls", "", "state", "unknown=1", "Auto", "media_player.living_room", "Media", ""};
  bool media_fields_called = false;
  bool media_options_called = false;
  assert(normalize_saved_config_media(
    media,
    [&](Config &config) {
      media_fields_called = true;
      config.sensor = "play_pause";
      config.label = "Play/Pause";
    },
    [&](const std::string &options, const std::string &mode) {
      media_options_called = mode == "play_pause";
      return options + "option-hook";
    }
  ));
  assert(media_fields_called && media_options_called);
  assert(media.sensor == "play_pause" && media.label == "Play/Pause");
  assert(media.options == "unknown=1option-hook");
  Config start{"action", "vacuum.start", "area", "2", "unknown=1", "Custom", "", "", ""};
  assert(migrate_saved_config_vacuum_legacy(start));
  assert(start.type == "vacuum" && start.sensor == "start_stop");
  assert(start.unit.empty() && start.precision.empty() && start.options.empty());
  assert(start.icon_on == "Auto");
  Config dock{"action", "vacuum.return_to_base", "area", "2", "unknown=1", "Custom", "", "", ""};
  assert(migrate_saved_config_vacuum_legacy(dock));
  assert(dock.type == "vacuum" && dock.sensor == "dock");
  Config unrelated{"action", "light.turn_on", "", "", "", "Auto", "", "", ""};
  assert(!migrate_saved_config_vacuum_legacy(unrelated));
  assert(normalize_saved_config_vacuum_sensor("dock") == "dock");
  assert(normalize_saved_config_vacuum_sensor("vacuum.start") == "start_stop");
  assert(normalize_saved_config_vacuum_sensor("vacuum.return_to_base") == "dock");
  assert(normalize_saved_config_vacuum_sensor("unknown") == "start_stop");
  assert(normalize_saved_config_vacuum_icon_on("Custom") == "Auto");
  assert(normalize_saved_config_vacuum_precision("2").empty());
  assert(normalize_saved_config_vacuum_options("").empty());
  assert(normalize_saved_config_vacuum_options("unknown=1").empty());
  Config local_sensor{"local_sensor", "stale", "unit", "7", "unknown=1", "Custom", "", "", ""};
  assert(migrate_saved_config_sensor_legacy(local_sensor));
  assert(local_sensor.type == "sensor" && local_sensor.sensor == "local");
  assert(local_sensor.icon_on == "Auto" && local_sensor.options.empty());
  Config regular_sensor{"sensor", "", "", "", "", "Auto", "", "", ""};
  assert(!migrate_saved_config_sensor_legacy(regular_sensor));
  Config text_sensor{"text_sensor", "stale", "unit", "7", "unknown=1", "Custom", "sensor.old", "Old label", ""};
  assert(migrate_saved_config_sensor_legacy(text_sensor));
  assert(text_sensor.type == "sensor" && text_sensor.precision == "text");
  assert(text_sensor.entity.empty() && text_sensor.label.empty() && text_sensor.unit.empty());
  assert(text_sensor.icon_on == "Auto");
  bool fields_called = false;
  bool options_called = false;
  assert(normalize_saved_config_sensor(
    text_sensor, true,
    [&](Config &config, bool was_legacy_text_sensor) {
      fields_called = was_legacy_text_sensor;
      if (was_legacy_text_sensor) config.sensor = "field-hook";
    },
    [&](const std::string &options, const std::string &precision) {
      options_called = precision == "text";
      return options + "option-hook";
    }
  ));
  assert(fields_called && options_called);
  assert(text_sensor.sensor == "field-hook" && text_sensor.options == "unknown=1option-hook");
  assert(!normalize_saved_config_sensor(
    unrelated, false,
    [](Config &, bool) {},
    [](const std::string &options, const std::string &) { return options; }
  ));
  Config screen_lock{"screen_lock", "stale", "unit", "2", "unknown=1", "Auto", "switch.stale", "Stale", "Security"};
  assert(normalize_saved_config_static(screen_lock));
  assert(screen_lock.entity.empty() && screen_lock.label.empty() && screen_lock.sensor.empty());
  assert(screen_lock.unit.empty() && screen_lock.precision.empty() && screen_lock.options.empty());
  assert(screen_lock.icon == "Lock" && screen_lock.icon_on == "Lock Open");
  Config light_switch{"light_switch", "stale", "unit", "2", "unknown=1", "Custom", "light.kitchen", "Kitchen", "Custom"};
  assert(normalize_saved_config_static(light_switch));
  assert(light_switch.sensor.empty() && light_switch.unit.empty());
  assert(light_switch.precision.empty() && light_switch.options.empty());
  assert(light_switch.entity == "light.kitchen" && light_switch.icon == "Custom");
  Config slider{"slider", "stale", "%", "2", "unknown=1", "Auto", "number.level", "Level", "Tune"};
  assert(normalize_saved_config_static(slider));
  assert(slider.sensor.empty() && slider.options.empty());
  assert(slider.unit == "%" && slider.precision == "2");
  Config light_temperature{"light_temperature", "sensor.temp", "K", "2", "unknown=1", "Auto", "light.kitchen", "Kitchen", "Thermometer"};
  assert(normalize_saved_config_static(light_temperature));
  assert(light_temperature.sensor == "sensor.temp" && light_temperature.unit == "K");
  assert(light_temperature.precision == "2" && light_temperature.options.empty());
  assert(!normalize_saved_config_static(unrelated));
}
`);
    childProcess.execFileSync(compiler(), [
      "-std=c++17", "-Wall", "-Wextra", "-Werror",
      `-I${path.join(ROOT, "components/espcontrol")}`, source, "-o", binary,
    ]);
    childProcess.execFileSync(binary);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function main() {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, "common/config/card_contract.json"), "utf8"));
  assert.deepStrictEqual(contract.cards.action.normalization.migrationActions.slice(0, 2), ["legacy_local_action", "legacy_option_select"]);
  const generatedAction = loadTypeScriptModule(path.join(ROOT, "src/webserver/generated/saved_config_action.ts"));
  const localAction = { type: "local", sensor: "stale", unit: "unit", precision: "2", options: "unknown=1", icon_on: "Custom" };
  assert.strictEqual(generatedAction.migrateSavedConfigActionLegacy(localAction), true);
  assert.deepStrictEqual(localAction, { type: "action", sensor: "local", unit: "", precision: "", options: "", icon_on: "Auto" });
  const optionSelect = { type: "option_select", sensor: "stale", unit: "unit", precision: "2", options: "unknown=1", icon_on: "Custom" };
  assert.strictEqual(generatedAction.migrateSavedConfigActionLegacy(optionSelect), true);
  assert.deepStrictEqual(optionSelect, { type: "action", sensor: "input_select.select_option", unit: "", precision: "", options: "", icon_on: "Auto" });
  assert.strictEqual(generatedAction.migrateSavedConfigActionLegacy({ type: "action", sensor: "scene.turn_on" }), false);
  const normalizedAction = { type: "action", sensor: "scene.turn_on", precision: "2", options: "unknown=1" };
  let actionFieldsCalled = false;
  let actionOptionsCalled = false;
  assert.strictEqual(generatedAction.normalizeSavedConfigAction(
    normalizedAction,
    (config) => {
      actionFieldsCalled = true;
      config.precision = "";
    },
    (options, action) => {
      actionOptionsCalled = action === "scene.turn_on";
      return options + "option-hook";
    },
  ), true);
  assert(actionFieldsCalled && actionOptionsCalled);
  assert.deepStrictEqual(normalizedAction, { type: "action", sensor: "scene.turn_on", precision: "", options: "unknown=1option-hook" });
  const generatedMedia = loadTypeScriptModule(path.join(ROOT, "src/webserver/generated/saved_config_media.ts"));
  const normalizedMedia = { type: "media", sensor: "controls", label: "Media", options: "unknown=1" };
  let mediaFieldsCalled = false;
  let mediaOptionsCalled = false;
  assert.strictEqual(generatedMedia.normalizeSavedConfigMedia(
    normalizedMedia,
    (config) => {
      mediaFieldsCalled = true;
      config.sensor = "play_pause";
      config.label = "Play/Pause";
    },
    (options, mode) => {
      mediaOptionsCalled = mode === "play_pause";
      return options + "option-hook";
    },
  ), true);
  assert(mediaFieldsCalled && mediaOptionsCalled);
  assert.deepStrictEqual(normalizedMedia, { type: "media", sensor: "play_pause", label: "Play/Pause", options: "unknown=1option-hook" });
  assert.strictEqual(generatedMedia.normalizeSavedConfigMedia(
    { type: "sensor", options: "keep", sensor: "" }, () => {}, (options) => options,
  ), false);
  const fields = contract.cards.vacuum.normalization.fields;
  assert.strictEqual(fields.sensor.policy, "allowed");
  assert.strictEqual(fields.sensor.fallback, "start_stop");
  assert.deepStrictEqual(fields.sensor.aliases, { "vacuum.start": "start_stop", "vacuum.return_to_base": "dock" });
  assert.strictEqual(fields.icon_on.policy, "default");
  assert.strictEqual(fields.icon_on.value, "Auto");
  assert.strictEqual(fields.precision.policy, "clear");
  assert.strictEqual(fields.options.policy, "clear");
  assert.deepStrictEqual(contract.cards.vacuum.normalization.migrationActions, ["legacy_vacuum_start", "legacy_vacuum_dock"]);

  const generated = loadTypeScriptModule(path.join(ROOT, "src/webserver/generated/saved_config_vacuum.ts"));
  const start = { type: "action", sensor: "vacuum.start", unit: "area", precision: "2", options: "unknown=1", icon_on: "Custom" };
  assert.strictEqual(generated.migrateSavedConfigVacuumLegacy(start), true);
  assert.deepStrictEqual(start, { type: "vacuum", sensor: "start_stop", unit: "", precision: "", options: "", icon_on: "Auto" });
  const dock = { type: "action", sensor: "vacuum.return_to_base", unit: "area", precision: "2", options: "unknown=1", icon_on: "Custom" };
  assert.strictEqual(generated.migrateSavedConfigVacuumLegacy(dock), true);
  assert.strictEqual(dock.type, "vacuum");
  assert.strictEqual(dock.sensor, "dock");
  assert.strictEqual(generated.migrateSavedConfigVacuumLegacy({ type: "action", sensor: "light.turn_on" }), false);
  assert.strictEqual(generated.normalizeSavedConfigVacuumSensor("dock"), "dock");
  assert.strictEqual(generated.normalizeSavedConfigVacuumSensor("vacuum.start"), "start_stop");
  assert.strictEqual(generated.normalizeSavedConfigVacuumSensor("vacuum.return_to_base"), "dock");
  assert.strictEqual(generated.normalizeSavedConfigVacuumSensor("unknown"), "start_stop");
  assert.strictEqual(generated.normalizeSavedConfigVacuumIconOn("Custom"), "Auto");
  assert.strictEqual(generated.normalizeSavedConfigVacuumPrecision("2"), "");
  assert.strictEqual(generated.normalizeSavedConfigVacuumOptions(""), "");
  assert.strictEqual(generated.normalizeSavedConfigVacuumOptions("unknown=1"), "");

  assert.deepStrictEqual(contract.cards.sensor.normalization.migrationActions.slice(0, 2), ["legacy_local_sensor", "legacy_text_sensor"]);
  const generatedSensor = loadTypeScriptModule(path.join(ROOT, "src/webserver/generated/saved_config_sensor.ts"));
  const localSensor = { type: "local_sensor", sensor: "stale", precision: "7", options: "unknown=1", icon_on: "Custom" };
  assert.strictEqual(generatedSensor.migrateSavedConfigSensorLegacy(localSensor), true);
  assert.deepStrictEqual(localSensor, { type: "sensor", sensor: "local", precision: "7", options: "", icon_on: "Auto" });
  assert.strictEqual(generatedSensor.migrateSavedConfigSensorLegacy({ type: "sensor", sensor: "local" }), false);
  const textSensor = { type: "text_sensor", entity: "sensor.old", label: "Old label", unit: "°C", precision: "7", icon_on: "Custom" };
  assert.strictEqual(generatedSensor.migrateSavedConfigSensorLegacy(textSensor), true);
  assert.deepStrictEqual(textSensor, { type: "sensor", entity: "", label: "", unit: "", precision: "text", icon_on: "Auto" });
  let sensorFieldsCalled = false;
  let sensorOptionsCalled = false;
  assert.strictEqual(generatedSensor.normalizeSavedConfigSensor(
    textSensor,
    true,
    (config, wasLegacyTextSensor) => {
      sensorFieldsCalled = wasLegacyTextSensor;
      config.sensor = "field-hook";
    },
    (options, precision) => {
      sensorOptionsCalled = precision === "text";
      return options + "option-hook";
    },
  ), true);
  assert(sensorFieldsCalled && sensorOptionsCalled);
  assert.strictEqual(textSensor.sensor, "field-hook");
  assert.strictEqual(textSensor.options, "option-hook");
  assert.strictEqual(generatedSensor.normalizeSavedConfigSensor(
    { type: "action", options: "keep", precision: "" }, false, () => {}, (options) => options,
  ), false);

  const generatedStatic = loadTypeScriptModule(path.join(ROOT, "src/webserver/generated/saved_config_static.ts"));
  const screenLock = {
    type: "screen_lock", entity: "switch.stale", label: "Stale", icon: "Security", icon_on: "Auto",
    sensor: "stale", unit: "unit", precision: "2", options: "unknown=1",
  };
  assert.strictEqual(generatedStatic.normalizeSavedConfigStatic(screenLock), true);
  assert.deepStrictEqual(screenLock, {
    type: "screen_lock", entity: "", label: "", icon: "Lock", icon_on: "Lock Open",
    sensor: "", unit: "", precision: "", options: "",
  });
  const internal = { type: "internal", entity: "relay_1", sensor: "push", options: "unknown=1" };
  assert.strictEqual(generatedStatic.normalizeSavedConfigStatic(internal), true);
  assert.deepStrictEqual(internal, { type: "internal", entity: "relay_1", sensor: "push", options: "" });
  const slider = { type: "slider", sensor: "stale", unit: "%", precision: "2", options: "unknown=1" };
  assert.strictEqual(generatedStatic.normalizeSavedConfigStatic(slider), true);
  assert.deepStrictEqual(slider, { type: "slider", sensor: "", unit: "%", precision: "2", options: "" });
  const lightTemperature = { type: "light_temperature", sensor: "sensor.temp", unit: "K", precision: "2", options: "unknown=1" };
  assert.strictEqual(generatedStatic.normalizeSavedConfigStatic(lightTemperature), true);
  assert.deepStrictEqual(lightTemperature, { type: "light_temperature", sensor: "sensor.temp", unit: "K", precision: "2", options: "" });
  assert.strictEqual(generatedStatic.normalizeSavedConfigStatic({ type: "sensor", options: "keep" }), false);

  const browser = fs.readFileSync(path.join(ROOT, "src/webserver/application/config_codec.ts"), "utf8");
  assert.match(browser, /from "\.\.\/generated\/saved_config_vacuum";/);
  assert.match(browser, /migrateSavedConfigVacuumLegacy\(b\)/);
  assert.doesNotMatch(browser, /b\.type === "action" && b\.sensor === "vacuum\.(?:start|return_to_base)"/);
  assert.match(browser, /sensor = normalizeSavedConfigVacuumSensor\(sensor\);/);
  assert.match(browser, /precision = normalizeSavedConfigVacuumPrecision\(precision\);/);
  assert.match(browser, /iconOn = normalizeSavedConfigVacuumIconOn\(iconOn\);/);
  assert.match(browser, /type === "vacuum"[\s\S]*?normalizeSavedConfigVacuumOptions\(options\)/);
  assert.doesNotMatch(browser, /type === "vacuum" \|\| type === "lawn_mower"/);
  assert.match(browser, /from "\.\.\/generated\/saved_config_sensor";/);
  assert.match(browser, /migrateSavedConfigSensorLegacy\(b\)/);
  assert.match(browser, /normalizeSavedConfigSensor\(b, wasLegacyTextSensor, normalizeSavedConfigSensorFields, normalizeSensorOptions\)/);
  assert.doesNotMatch(browser, /if \(b && b\.type === "local_sensor"\)/);
  assert.doesNotMatch(browser, /if \(b && b\.type === "text_sensor"\)/);
  assert.doesNotMatch(browser, /else if \(b && b\.type === "sensor"\)/);
  assert.match(browser, /from "\.\.\/generated\/saved_config_action";/);
  assert.match(browser, /migrateSavedConfigActionLegacy\(b\)/);
  assert.match(browser, /normalizeSavedConfigAction\(b, normalizeSavedConfigActionFields, normalizeActionOptions\)/);
  assert.doesNotMatch(browser, /if \(b && b\.type === "local"\) \{\s*b\.type = "action"/);
  assert.doesNotMatch(browser, /if \(b && b\.type === "option_select"\) \{\s*b\.type = "action"/);
  assert.doesNotMatch(browser, /else if \(b && b\.type === "action"\)/);
  assert.match(browser, /from "\.\.\/generated\/saved_config_media";/);
  assert.match(browser, /normalizeSavedConfigMedia\(b, normalizeSavedConfigMediaFields, normalizeMediaOptions\)/);
  assert.doesNotMatch(browser, /if \(b && b\.type === "media"\)/);
  assert.match(browser, /from "\.\.\/generated\/saved_config_static";/);
  assert.match(browser, /normalizeSavedConfigStatic\(b\)/);
  assert.doesNotMatch(browser, /if \(b && b\.type === "screen_lock"\)/);
  assert.doesNotMatch(browser, /if \(b && b\.type === "light_switch"\)/);
  assert.doesNotMatch(browser, /if \(b && isBrightnessSliderType\(b\.type\) && b\.sensor\)/);

  const vacuumCard = fs.readFileSync(path.join(ROOT, "src/webserver/cards/vacuum.ts"), "utf8");
  assert.match(vacuumCard, /normalizeSavedConfigVacuumSensor\(String\(b\.sensor \|\| ""\)\)/);
  assert.match(vacuumCard, /normalizeSavedConfigVacuumPrecision\(String\(b\.precision \|\| ""\)\)/);
  assert.match(vacuumCard, /normalizeSavedConfigVacuumOptions\(String\(b\.options \|\| ""\)\)/);
  assert.match(vacuumCard, /normalizeSavedConfigVacuumIconOn\(String\(b\.icon_on \|\| ""\)\)/);
  assert.doesNotMatch(vacuumCard, /normalizeEntityModeCardConfig\(b,/);

  const firmware = fs.readFileSync(path.join(ROOT, "components/espcontrol/button_grid_config_parser.h"), "utf8");
  assert.match(firmware, /#include "button_grid_saved_config_vacuum_generated\.h"/);
  const vacuumStart = firmware.indexOf('if (p.type == "vacuum")');
  const mowerStart = firmware.indexOf('if (p.type == "lawn_mower")', vacuumStart);
  assert(vacuumStart >= 0 && mowerStart > vacuumStart, "Vacuum production normalization block not found");
  const vacuumBlock = firmware.slice(vacuumStart, mowerStart);
  assert.match(firmware, /migrate_saved_config_vacuum_legacy\(p\)/);
  assert.doesNotMatch(firmware, /p\.type == "action" && p\.sensor == "vacuum\.(?:start|return_to_base)"/);
  assert.match(vacuumBlock, /p\.sensor = normalize_saved_config_vacuum_sensor\(p\.sensor\);/);
  assert.match(vacuumBlock, /p\.precision = normalize_saved_config_vacuum_precision\(p\.precision\);/);
  assert.match(vacuumBlock, /p\.icon_on = normalize_saved_config_vacuum_icon_on\(p\.icon_on\);/);
  assert.match(vacuumBlock, /p\.options = normalize_saved_config_vacuum_options\(p\.options\);/);
  assert.doesNotMatch(vacuumBlock, /p\.options\.clear\(\);/);
  assert.match(firmware, /#include "button_grid_saved_config_sensor_generated\.h"/);
  assert.match(firmware, /migrate_saved_config_sensor_legacy\(p\)/);
  assert.match(firmware, /normalize_saved_config_sensor\(p, was_legacy_text_sensor,/);
  assert.doesNotMatch(firmware, /p\.type == "local_sensor"/);
  assert.doesNotMatch(firmware, /if \(p\.type == "text_sensor"\)/);
  assert.match(firmware, /#include "button_grid_saved_config_action_generated\.h"/);
  assert.match(firmware, /migrate_saved_config_action_legacy\(p\)/);
  assert.match(firmware, /normalize_saved_config_action\(p, normalize_saved_config_action_fields,/);
  assert.doesNotMatch(firmware, /if \(p\.type == "local"\)/);
  assert.doesNotMatch(firmware, /if \(p\.type == "option_select"\)/);
  assert.doesNotMatch(firmware, /if \(p\.type == "action"\) \{\s*p\.precision\.clear\(\);/);
  assert.match(firmware, /#include "button_grid_saved_config_media_generated\.h"/);
  assert.match(firmware, /normalize_saved_config_media\(p, normalize_saved_config_media_fields,/);
  assert.doesNotMatch(firmware, /if \(p\.type == "media"\) \{\s*if \(p\.sensor == "controls"\)/);
  assert.match(firmware, /#include "button_grid_saved_config_static_generated\.h"/);
  assert.match(firmware, /normalize_saved_config_static\(p\)/);
  assert.doesNotMatch(firmware, /if \(p\.type == "screen_lock"\)/);
  assert.doesNotMatch(firmware, /if \(p\.type == "light_switch"\)/);
  assert.doesNotMatch(firmware, /brightness_slider_type\(p\.type\) && !p\.sensor\.empty\(\)/);

  checkCompiledHelper();
  console.log("Saved-config production check passed: Action, Media, Sensor, Vacuum, and static card normalization use generated browser and compiled firmware helpers.");
}

main();
