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
  return !!(state._indoorOn || state._outdoorOn);
}

var CLOCK_BAR_SECTIONS = ["left", "middle", "right"];
var CLOCK_BAR_DEFAULT_SECTION = {
  temperature: "left",
  time: "middle",
  network: "right",
};
var CLOCK_BAR_DEFAULT_LAYOUT = {
  left: ["temperature"],
  middle: ["time"],
  right: ["network"],
};
var CLOCK_BAR_ITEMS = ["temperature", "time", "network"];
var CLOCK_BAR_LAYOUT_STORAGE_PREFIX = "espcontrol.clockBarLayout.";
var clockBarLayoutLoaded = false;

function clockBarItemActive(item) {
  if (item === "temperature") return clockBarTemperatureActive();
  if (item === "time") return !!state.clockBarTimeOn;
  if (item === "network") return !!state.networkStatusOn;
  return false;
}

function clockBarItemElement(item) {
  return els.clockBarItems && els.clockBarItems[item] || null;
}

function clockBarItemLabel(item) {
  if (item === "temperature") return "Temperature";
  if (item === "time") return "Time";
  if (item === "network") return "Network Status";
  return "Clock Bar";
}

function clockBarItemIcon(item) {
  if (item === "temperature") return "thermometer";
  if (item === "time") return "clock-outline";
  if (item === "network") return "wifi-strength-4";
  return "plus";
}

function clockBarLayoutStorageKey() {
  return CLOCK_BAR_LAYOUT_STORAGE_PREFIX + (typeof DEVICE_ID === "string" ? DEVICE_ID : "default");
}

function cloneClockBarLayout(layout) {
  var out = { left: [], middle: [], right: [] };
  CLOCK_BAR_SECTIONS.forEach(function (section) {
    (layout && layout[section] || []).forEach(function (item) {
      if (CLOCK_BAR_ITEMS.indexOf(item) !== -1 && out[section].indexOf(item) === -1) out[section].push(item);
    });
  });
  return out;
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

function saveClockBarLayout() {
  if (!state.clockBarLayout) return;
  clockBarLayoutLoaded = true;
  try {
    if (window.localStorage) {
      window.localStorage.setItem(clockBarLayoutStorageKey(), JSON.stringify(cloneClockBarLayout(state.clockBarLayout)));
    }
  } catch (_) {}
}

function normalizeClockBarLayout() {
  var current = loadClockBarLayout();
  var next = { left: [], middle: [], right: [] };
  var seen = {};
  CLOCK_BAR_SECTIONS.forEach(function (section) {
    (current[section] || []).forEach(function (item) {
      if (CLOCK_BAR_ITEMS.indexOf(item) === -1 || seen[item]) return;
      seen[item] = true;
      next[section].push(item);
    });
  });
  CLOCK_BAR_ITEMS.forEach(function (item) {
    if (seen[item] || !clockBarItemActive(item)) return;
    next[CLOCK_BAR_DEFAULT_SECTION[item]].push(item);
  });
  state.clockBarLayout = next;
  return next;
}

function moveClockBarItem(item, section) {
  if (isConfigLocked() || CLOCK_BAR_ITEMS.indexOf(item) === -1 || CLOCK_BAR_SECTIONS.indexOf(section) === -1) return;
  var layout = normalizeClockBarLayout();
  CLOCK_BAR_SECTIONS.forEach(function (name) {
    layout[name] = layout[name].filter(function (entry) { return entry !== item; });
  });
  layout[section].push(item);
  state.clockBarLayout = layout;
  saveClockBarLayout();
  updateClockBarItemUi();
}

function removeClockBarItemFromLayout(item) {
  var layout = normalizeClockBarLayout();
  CLOCK_BAR_SECTIONS.forEach(function (section) {
    layout[section] = layout[section].filter(function (entry) { return entry !== item; });
  });
  state.clockBarLayout = layout;
  saveClockBarLayout();
}

function clockBarItemsAvailableToAdd(section) {
  normalizeClockBarLayout();
  var out = [];
  CLOCK_BAR_ITEMS.forEach(function (item) {
    if (!clockBarItemActive(item) || !clockBarItemElement(item)) out.push(item);
  });
  return out;
}

function createClockBarItemElement(item, section) {
  var button = document.createElement("button");
  button.type = "button";
  button.className = "sp-clockbar-item sp-clockbar-" + item;
  button.setAttribute("data-clockbar-item", item);
  button.setAttribute("data-clockbar-section", section);
  button.setAttribute("aria-label", "Edit " + clockBarItemLabel(item).toLowerCase());
  button.draggable = true;

  if (item === "temperature") {
    var temp = document.createElement("span");
    temp.className = "sp-temp";
    temp.textContent = "--";
    button.appendChild(temp);
    els.temp = temp;
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
  els.temp = null;
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
  syncClockBarItemElement("temperature");
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
  if (item === "temperature") {
    var restoreIndoor = !!state.clockBarTempRestoreIndoor;
    var restoreOutdoor = !!state.clockBarTempRestoreOutdoor;
    if (!restoreIndoor && !restoreOutdoor) restoreOutdoor = true;
    state._indoorOn = restoreIndoor;
    state._outdoorOn = restoreOutdoor;
    postSwitch(entityName("indoor_temp_enable"), state._indoorOn);
    postSwitch(entityName("outdoor_temp_enable"), state._outdoorOn);
    syncTemperatureUi();
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
}

function deleteClockBarItem(item) {
  if (isConfigLocked()) return;
  removeClockBarItemFromLayout(item);
  if (item === "temperature") {
    state.clockBarTempRestoreIndoor = !!state._indoorOn;
    state.clockBarTempRestoreOutdoor = !!state._outdoorOn;
    state._indoorOn = false;
    state._outdoorOn = false;
    postSwitch(entityName("indoor_temp_enable"), false);
    postSwitch(entityName("outdoor_temp_enable"), false);
    syncTemperatureUi();
    updateTempPreview();
  } else if (item === "time") {
    state.clockBarTimeOn = false;
    postClockBarTime(false);
    syncClockBarUi();
  } else if (item === "network") {
    state.networkStatusOn = false;
    postNetworkStatusIcon(false);
    syncClockBarUi();
  }
  state.clockBarSelectedItem = "";
  hideSettingsOverlay();
  updateClockBarItemUi();
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
  if (!els.temp) return;
  var show = state.clockBarOn && clockBarTemperatureActive();
  els.temp.className = "sp-temp" + (show ? " sp-visible" : "");
  var unit = clockBarTemperatureUnitSymbol();
  var indoor = state._indoorVal != null ? state._indoorVal : "24";
  var outdoor = state._outdoorVal != null ? state._outdoorVal : "17";
  if (state._indoorOn && state._outdoorOn) {
    els.temp.textContent = outdoor + unit + " / " + indoor + unit;
  } else if (state._outdoorOn) {
    els.temp.textContent = outdoor + unit;
  } else if (state._indoorOn) {
    els.temp.textContent = indoor + unit;
  }
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
