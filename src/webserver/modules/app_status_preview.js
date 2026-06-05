// ── Clock (minute-aligned) ─────────────────────────────────────────────

function getTzId(tz) {
  var idx = tz.indexOf(" (");
  return idx > 0 ? tz.substring(0, idx) : tz;
}

function formatGmtOffset(minutes) {
  var sign = minutes >= 0 ? "+" : "-";
  var abs = Math.abs(minutes);
  var h = Math.floor(abs / 60);
  var m = abs % 60;
  return "GMT" + sign + h + (m ? ":" + String(m).padStart(2, "0") : "");
}

function timezoneOffsetMinutes(tzId, date) {
  try {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tzId,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).formatToParts(date);
    var values = {};
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type !== "literal") values[parts[i].type] = parts[i].value;
    }
    var localAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );
    return Math.round((localAsUtc - date.getTime()) / 60000);
  } catch (_) {
    return null;
  }
}

function formatTimezoneOption(opt) {
  var tzId = getTzId(opt);
  var offset = timezoneOffsetMinutes(tzId, new Date());
  if (offset == null || !isFinite(offset)) return opt;
  return tzId + " (" + formatGmtOffset(offset) + ")";
}

function appendTimezoneOption(select, opt) {
  var o = document.createElement("option");
  o.value = opt;
  o.textContent = formatTimezoneOption(opt);
  select.appendChild(o);
}

function updateClockText() {
  if (!els.clock) return;
  var now = new Date();
  var tzId = getTzId(state.timezone);
  try {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tzId, hour: "numeric", minute: "2-digit",
      hour12: state.clockFormat === "12h"
    }).formatToParts(now);
    var h = "", m = "";
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "hour") h = parts[i].value;
      else if (parts[i].type === "minute") m = parts[i].value;
    }
    els.clock.textContent = (state.clockFormat === "24h"
      ? h.padStart(2, "0") : h) + ":" + m;
  } catch (_) {
    var hr = now.getUTCHours();
    var mn = String(now.getUTCMinutes()).padStart(2, "0");
    els.clock.textContent = String(hr).padStart(2, "0") + ":" + mn;
  }
}

function updateClock() {
  updateClockText();
  var now = new Date();
  var msToNext = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(updateClock, msToNext + 50);
}

function clockBarTemperatureActive() {
  return clockBarTemperatureEntries().length > 0;
}

var CLOCK_BAR_SECTIONS = ["left", "middle", "right"];
var CLOCK_BAR_DEFAULT_LAYOUT = {
  left: ["temperature"],
  middle: ["time"],
  right: ["network"],
};
var CLOCK_BAR_LAYOUT_STORAGE_PREFIX = "espcontrol.clockBarLayout.";
var clockBarLayoutLoaded = false;

function clockBarTemperatureItemId(index) {
  return index === 0 ? "temperature" : "temperature_" + (index + 1);
}

function clockBarTemperatureItemIndex(item) {
  if (item === "temperature") return 0;
  var match = String(item || "").match(/^temperature_(\d+)$/);
  if (!match) return -1;
  var index = parseInt(match[1], 10) - 1;
  return index >= 1 && index < MAX_CLOCK_BAR_TEMPERATURES ? index : -1;
}

function isClockBarTemperatureItem(item) {
  return clockBarTemperatureItemIndex(item) >= 0;
}

function clockBarTemperatureItemIds(includeNext) {
  var count = clockBarTemperatureEntries().length;
  if (includeNext && count < MAX_CLOCK_BAR_TEMPERATURES) count++;
  var out = [];
  for (var i = 0; i < count && i < MAX_CLOCK_BAR_TEMPERATURES; i++) {
    out.push(clockBarTemperatureItemId(i));
  }
  return out;
}

function clockBarItems(includeNextTemperature) {
  return clockBarTemperatureItemIds(!!includeNextTemperature).concat(["time", "network"]);
}

function clockBarDefaultSection(item) {
  if (isClockBarTemperatureItem(item)) return "left";
  if (item === "time") return "middle";
  if (item === "network") return "right";
  return "left";
}

function clockBarItemActive(item) {
  var tempIndex = clockBarTemperatureItemIndex(item);
  if (tempIndex >= 0) return tempIndex < clockBarTemperatureEntries().length;
  if (item === "time") return !!state.clockBarTimeOn;
  if (item === "network") return !!state.networkStatusOn;
  return false;
}

function clockBarItemElement(item) {
  return els.clockBarItems && els.clockBarItems[item] || null;
}

function clockBarItemLabel(item) {
  if (isClockBarTemperatureItem(item)) return "Temperature";
  if (item === "time") return "Time";
  if (item === "network") return "Network Status";
  return "Clock Bar";
}

function clockBarItemHasSettings(item) {
  return isClockBarTemperatureItem(item);
}

function clockBarItemIcon(item) {
  if (isClockBarTemperatureItem(item)) return "thermometer";
  if (item === "time") return "clock-outline";
  if (item === "network") return "wifi-strength-4";
  return "plus";
}

function clockBarLayoutStorageKey() {
  return CLOCK_BAR_LAYOUT_STORAGE_PREFIX + (typeof DEVICE_ID === "string" ? DEVICE_ID : "default");
}

function cloneClockBarLayout(layout) {
  var out = { left: [], middle: [], right: [] };
  var allowed = clockBarItems(true);
  CLOCK_BAR_SECTIONS.forEach(function (section) {
    (layout && layout[section] || []).forEach(function (item) {
      if (allowed.indexOf(item) !== -1 && out[section].indexOf(item) === -1) out[section].push(item);
    });
  });
  return out;
}

function serializeClockBarLayout(layout) {
  layout = cloneClockBarLayout(layout || CLOCK_BAR_DEFAULT_LAYOUT);
  return CLOCK_BAR_SECTIONS.map(function (section) {
    return section + ":" + layout[section].join(",");
  }).join("|");
}

function parseClockBarLayout(value) {
  var out = { left: [], middle: [], right: [] };
  var seen = {};
  var allowed = clockBarItems(true);
  String(value || "").split("|").forEach(function (segment) {
    var parts = segment.split(":");
    if (parts.length < 2) return;
    var section = parts[0];
    if (CLOCK_BAR_SECTIONS.indexOf(section) === -1) return;
    parts.slice(1).join(":").split(",").forEach(function (item) {
      item = item.trim();
      if (allowed.indexOf(item) === -1 || seen[item]) return;
      seen[item] = true;
      out[section].push(item);
    });
  });
  return cloneClockBarLayout(out);
}

function applyClockBarLayoutValue(value) {
  state.clockBarLayout = cloneClockBarLayout(parseClockBarLayout(value));
  clockBarLayoutLoaded = true;
  saveClockBarLayout(false);
  updateClockBarItemUi();
}

function loadClockBarLayout() {
  if (clockBarLayoutLoaded && state.clockBarLayout) return state.clockBarLayout;
  var loaded = null;
  try {
    if (window.localStorage) loaded = JSON.parse(window.localStorage.getItem(clockBarLayoutStorageKey()) || "null");
  } catch (_) {
    loaded = null;
  }
  state.clockBarLayout = cloneClockBarLayout(loaded || state.clockBarLayout || CLOCK_BAR_DEFAULT_LAYOUT);
  clockBarLayoutLoaded = true;
  return state.clockBarLayout;
}

function saveClockBarLayout(postDevice) {
  if (!state.clockBarLayout) return;
  clockBarLayoutLoaded = true;
  var serialized = serializeClockBarLayout(state.clockBarLayout);
  try {
    if (window.localStorage) {
      window.localStorage.setItem(clockBarLayoutStorageKey(), JSON.stringify(cloneClockBarLayout(state.clockBarLayout)));
    }
  } catch (_) {}
  if (postDevice) postClockBarLayout(serialized);
}

function normalizeClockBarLayout() {
  var current = loadClockBarLayout();
  var next = { left: [], middle: [], right: [] };
  var seen = {};
  var allowed = clockBarItems(true);
  CLOCK_BAR_SECTIONS.forEach(function (section) {
    (current[section] || []).forEach(function (item) {
      if (allowed.indexOf(item) === -1 || seen[item]) return;
      seen[item] = true;
      next[section].push(item);
    });
  });
  clockBarItems(false).forEach(function (item) {
    if (seen[item] || !clockBarItemActive(item)) return;
    next[clockBarDefaultSection(item)].push(item);
  });
  state.clockBarLayout = next;
  return next;
}

function moveClockBarItem(item, section) {
  if (isConfigLocked() || clockBarItems(true).indexOf(item) === -1 || CLOCK_BAR_SECTIONS.indexOf(section) === -1) return;
  var layout = normalizeClockBarLayout();
  CLOCK_BAR_SECTIONS.forEach(function (name) {
    layout[name] = layout[name].filter(function (entry) { return entry !== item; });
  });
  layout[section].push(item);
  state.clockBarLayout = layout;
  saveClockBarLayout(true);
  updateClockBarItemUi();
}

function removeClockBarItemFromLayout(item) {
  var layout = normalizeClockBarLayout();
  CLOCK_BAR_SECTIONS.forEach(function (section) {
    layout[section] = layout[section].filter(function (entry) { return entry !== item; });
  });
  state.clockBarLayout = layout;
  saveClockBarLayout(true);
}

function removeClockBarTemperatureItemFromLayout(index) {
  var layout = normalizeClockBarLayout();
  CLOCK_BAR_SECTIONS.forEach(function (section) {
    var next = [];
    (layout[section] || []).forEach(function (entry) {
      var tempIndex = clockBarTemperatureItemIndex(entry);
      if (tempIndex < 0) {
        next.push(entry);
      } else if (tempIndex < index) {
        next.push(entry);
      } else if (tempIndex > index) {
        next.push(clockBarTemperatureItemId(tempIndex - 1));
      }
    });
    layout[section] = next;
  });
  state.clockBarLayout = layout;
  saveClockBarLayout(true);
}

function clockBarItemsAvailableToAdd(section) {
  normalizeClockBarLayout();
  var out = [];
  clockBarItems(true).forEach(function (item) {
    if (!clockBarItemActive(item) || !clockBarItemElement(item)) out.push(item);
  });
  return out;
}

function createClockBarItemElement(item, section) {
  var button = document.createElement("button");
  button.type = "button";
  button.className = "sp-clockbar-item sp-clockbar-" + (isClockBarTemperatureItem(item) ? "temperature" : item);
  button.setAttribute("data-clockbar-item", item);
  button.setAttribute("data-clockbar-section", section);
  button.setAttribute("aria-label", "Edit " + clockBarItemLabel(item).toLowerCase());
  button.draggable = true;

  if (isClockBarTemperatureItem(item)) {
    var temp = document.createElement("span");
    temp.className = "sp-temp";
    temp.textContent = "--";
    button.appendChild(temp);
    if (!els.temps) els.temps = {};
    els.temps[item] = temp;
  } else if (item === "time") {
    var clock = document.createElement("span");
    clock.className = "sp-clock";
    clock.textContent = "--:--";
    button.appendChild(clock);
    els.clock = clock;
  } else if (item === "network") {
    var network = document.createElement("span");
    network.className = "sp-network-preview mdi mdi-wifi-strength-4";
    button.appendChild(network);
    els.networkPreview = network;
  }
  return button;
}

function createClockBarAddElement(section) {
  var button = document.createElement("button");
  button.type = "button";
  button.className = "sp-clockbar-section-add";
  button.setAttribute("data-clockbar-add", section);
  button.setAttribute("aria-label", "Add Clock Bar item to " + section);
  button.innerHTML = '<span class="mdi mdi-plus"></span>';
  return button;
}

function renderClockBarLayout() {
  if (!els.clockBarSections) return;
  var layout = normalizeClockBarLayout();
  els.clockBarItems = {};
  els.temps = {};
  els.clock = null;
  els.networkPreview = null;
  CLOCK_BAR_SECTIONS.forEach(function (section) {
    var container = els.clockBarSections[section];
    if (!container) return;
    container.innerHTML = "";
    var rendered = 0;
    if (section === "right") container.appendChild(createClockBarAddElement(section));
    layout[section].forEach(function (item) {
      if (!clockBarItemActive(item)) return;
      var itemEl = createClockBarItemElement(item, section);
      container.appendChild(itemEl);
      els.clockBarItems[item] = itemEl;
      rendered++;
    });
    container.className = "sp-clockbar-section sp-clockbar-" + section + (rendered ? "" : " sp-clockbar-section-empty");
    if (section !== "right") container.appendChild(createClockBarAddElement(section));
  });
  updateTempPreview();
  updateClockText();
  updateNetworkPreview();
}

function syncClockBarItemElement(item) {
  var el = clockBarItemElement(item);
  if (!el) return;
  var active = clockBarItemActive(item);
  el.className = el.className
    .replace(/\s?sp-clockbar-inactive/g, "")
    .replace(/\s?sp-selected/g, "");
  if (!active) el.className += " sp-clockbar-inactive";
  if (state.clockBarSelectedItem === item) el.className += " sp-selected";
  el.setAttribute("aria-pressed", state.clockBarSelectedItem === item ? "true" : "false");
  el.setAttribute("title", active ? "Edit " + clockBarItemLabel(item) : "Add " + clockBarItemLabel(item));
}

function updateClockBarItemUi() {
  renderClockBarLayout();
  clockBarTemperatureItemIds(true).forEach(syncClockBarItemElement);
  syncClockBarItemElement("time");
  syncClockBarItemElement("network");
}

function setClockBarItemSelected(item, open) {
  state.clockBarSelectedItem = item || "";
  if (item) {
    ctx().setSelected([]);
    ctx().setLastClicked(-1);
  }
  updateClockBarItemUi();
  renderPreview();
  renderButtonSettings(!!open);
}

function addClockBarItem(item) {
  if (isConfigLocked()) return;
  if (isClockBarTemperatureItem(item)) {
    var tempIndex = clockBarTemperatureItemIndex(item);
    var restore = normalizeClockBarTemperatureEntities(state.clockBarTempRestoreEntities);
    var next = clockBarTemperatureEntries();
    if (tempIndex >= next.length) {
      while (next.length < tempIndex) next.push("");
      next[tempIndex] = restore[tempIndex] || "";
      if (!next[tempIndex] && tempIndex === 0) next[tempIndex] = "sensor.outdoor_temperature";
    }
    applyClockBarTemperatureEntities(next, true);
    updateTempPreview();
  } else if (item === "time") {
    state.clockBarTimeOn = true;
    postClockBarTime(true);
    syncClockBarUi();
  } else if (item === "network") {
    state.networkStatusOn = true;
    postNetworkStatusIcon(true);
    syncClockBarUi();
  }
  normalizeClockBarLayout();
  saveClockBarLayout(true);
}

function deleteClockBarItem(item) {
  if (isConfigLocked()) return;
  if (isClockBarTemperatureItem(item)) {
    var tempIndex = clockBarTemperatureItemIndex(item);
    removeClockBarTemperatureItemFromLayout(tempIndex);
    state.clockBarTempRestoreIndoor = !!state._indoorOn;
    state.clockBarTempRestoreOutdoor = !!state._outdoorOn;
    state.clockBarTempRestoreEntities = clockBarTemperatureEntities();
    var next = clockBarTemperatureEntries();
    if (tempIndex >= 0) next.splice(tempIndex, 1);
    applyClockBarTemperatureEntities(next, true);
    updateTempPreview();
  } else if (item === "time") {
    removeClockBarItemFromLayout(item);
    state.clockBarTimeOn = false;
    postClockBarTime(false);
    syncClockBarUi();
  } else if (item === "network") {
    removeClockBarItemFromLayout(item);
    state.networkStatusOn = false;
    postNetworkStatusIcon(false);
    syncClockBarUi();
  }
  state.clockBarSelectedItem = "";
  hideSettingsOverlay();
  updateClockBarItemUi();
  renderPreview();
}

function syncInput(el, val) {
  if (el && document.activeElement !== el) el.value = val;
}

function gridHasAny() {
  for (var i = 0; i < NUM_SLOTS; i++) { if (state.grid[i] > 0) return true; }
  return false;
}

function scheduleMigration() {
  if (orderReceived || gridHasAny()) return;
  clearTimeout(migrationTimer);
  migrationTimer = setTimeout(function () {
    if (orderReceived || gridHasAny()) return;
    var pos = 0;
    for (var i = 0; i < NUM_SLOTS; i++) {
      if (state.buttons[i].entity && pos < NUM_SLOTS) {
        state.grid[pos] = i + 1;
        pos++;
      }
    }
    if (pos > 0) {
      renderPreview();
      renderButtonSettings();
      postText(entityName("button_order"), serializeGrid(state.grid));
    }
  }, 2000);
}

function updateSunInfo() {
  var el = els.sunInfo;
  if (!el) return;
  if (!state.sunrise && !state.sunset) {
    el.classList.remove("sp-visible");
    return;
  }
  el.classList.add("sp-visible");
  var t = "";
  if (state.sunrise) t += "Sunrise: " + escHtml(state.sunrise);
  if (state.sunrise && state.sunset) t += " \u00a0/\u00a0 ";
  if (state.sunset) t += "Sunset: " + escHtml(state.sunset);
  el.innerHTML = t;
}

function updateTempPreview() {
  if (!els.temps) return;
  var show = state.clockBarOn;
  var unit = clockBarTemperatureUnitSymbol();
  var sampleValues = ["17", "24", "21", "19", "22", "18"];
  clockBarTemperatureEntries().forEach(function (_, index) {
    var item = clockBarTemperatureItemId(index);
    var el = els.temps[item];
    if (!el) return;
    var value = sampleValues[index] || "--";
    if (index === 0 && state._outdoorVal != null) value = state._outdoorVal;
    if (index === 1 && state._indoorVal != null) value = state._indoorVal;
    el.className = "sp-temp" + (show ? " sp-visible" : "");
    el.textContent = value + unit;
  });
}

function normalizeNetworkTransport(value) {
  value = String(value == null ? "" : value).trim().toLowerCase();
  return value === "ethernet" ? "ethernet" : "wifi";
}

function normalizeWifiStrengthPercent(value) {
  var n = parseFloat(value);
  if (!isFinite(n)) return 100;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function networkPreviewIconSlug(transport, strengthPercent) {
  if (normalizeNetworkTransport(transport) === "ethernet") return "ethernet";
  var strength = normalizeWifiStrengthPercent(strengthPercent);
  if (strength < 25) return "wifi-strength-1";
  if (strength < 50) return "wifi-strength-2";
  if (strength < 75) return "wifi-strength-3";
  return "wifi-strength-4";
}

function updateNetworkPreview() {
  if (!els.networkPreview) return;
  var show = state.clockBarOn && state.networkStatusOn;
  els.networkPreview.className = "sp-network-preview mdi mdi-" +
    networkPreviewIconSlug(state.networkTransport, state.wifiStrengthPercent) +
    (show ? " sp-visible" : "");
}
