#pragma once

#include <memory>
#include <string>
#include <utility>
#include <vector>

#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

// ── Home Assistant API boundary ──────────────────────────────────────

using HomeAssistantStateCallback = std::function<void(esphome::StringRef)>;
using HomeAssistantActionResponseCallback =
  std::function<void(const esphome::api::ActionResponse &)>;

inline bool ha_entity_state_unavailable_ref(const std::string &entity_id,
                                            esphome::StringRef state);
inline uint32_t &ha_subscription_generation();

inline bool ha_api_available() {
  return esphome::api::global_api_server != nullptr;
}

inline bool ha_api_connected() {
  return ha_api_available() && esphome::api::global_api_server->is_connected();
}

inline bool ha_api_state_connected() {
  return ha_api_available() && esphome::api::global_api_server->is_connected_with_state_subscription();
}

constexpr uint32_t HA_UNAVAILABLE_STATE_RETRY_INTERVAL_MS = 5000;
constexpr uint32_t HA_UNAVAILABLE_STATE_RETRY_RESPONSE_TIMEOUT_MS = 10000;
constexpr size_t HA_ACTION_INTERNAL_FREE_MIN_BYTES = 12 * 1024;
constexpr size_t HA_ACTION_INTERNAL_LARGEST_MIN_BYTES = 4 * 1024;

struct HaUnavailableStateRetryRef {
  std::string entity_id;
  std::shared_ptr<HomeAssistantStateCallback> callback;
  uint32_t generation = 0;
  uint32_t last_request_ms = 0;
  bool waiting_for_response = false;
  bool unavailable = false;
};

inline std::vector<HaUnavailableStateRetryRef> &ha_unavailable_state_retry_refs() {
  static std::vector<HaUnavailableStateRetryRef> refs;
  return refs;
}

inline void ha_reset_unavailable_state_retries() {
  ha_unavailable_state_retry_refs().clear();
}
#define ESPCONTROL_HA_RETRY_HELPERS_DEFINED 1

inline void ha_note_state_retry_result(const std::string &entity_id,
                                       esphome::StringRef state,
                                       uint32_t generation) {
  std::vector<HaUnavailableStateRetryRef> &refs = ha_unavailable_state_retry_refs();
  for (auto &ref : refs) {
    if (ref.generation != generation || ref.entity_id != entity_id) continue;
    ref.unavailable = ha_entity_state_unavailable_ref(entity_id, state);
    ref.waiting_for_response = false;
  }
}

inline void ha_retry_unavailable_states(bool force = false) {
  if (!ha_api_state_connected()) return;
  const uint32_t now = esphome::millis();
  const uint32_t active_generation = ha_subscription_generation();
  std::vector<HaUnavailableStateRetryRef> &refs = ha_unavailable_state_retry_refs();

  for (auto &ref : refs) {
    if (ref.generation != active_generation || !ref.unavailable || !ref.callback) continue;
    if (ref.waiting_for_response) {
      if (ref.last_request_ms != 0 &&
          now - ref.last_request_ms < HA_UNAVAILABLE_STATE_RETRY_RESPONSE_TIMEOUT_MS) {
        continue;
      }
      ref.waiting_for_response = false;
    }
    if (!force) {
      if (ref.last_request_ms != 0 &&
          now - ref.last_request_ms < HA_UNAVAILABLE_STATE_RETRY_INTERVAL_MS) {
        continue;
      }
    }

    ref.waiting_for_response = true;
    ref.last_request_ms = now;
    const std::string entity_id = ref.entity_id;
    const uint32_t generation = ref.generation;
    auto callback = ref.callback;
    esphome::api::global_api_server->get_home_assistant_state(
      entity_id, {},
      [entity_id, generation, callback](esphome::StringRef state) {
        ha_note_state_retry_result(entity_id, state, generation);
        if (callback && *callback) (*callback)(state);
      });
  }
}

inline bool ha_action_begin(esphome::api::HomeassistantActionRequest &req,
                            const char *service,
                            bool is_event,
                            size_t data_count,
                            uint32_t call_id = 0) {
  if (!ha_api_available() || service == nullptr || service[0] == '\0') return false;
  req.service = decltype(req.service)(service);
  req.is_event = is_event;
  if (call_id != 0) req.call_id = call_id;
  req.data.init(data_count);
  return true;
}

inline void ha_action_add_data(esphome::api::HomeassistantActionRequest &req,
                               const char *key,
                               const char *value) {
  auto &kv = req.data.emplace_back();
  kv.key = decltype(kv.key)(key ? key : "");
  kv.value = decltype(kv.value)(value ? value : "");
}

inline void ha_action_add_entity(esphome::api::HomeassistantActionRequest &req,
                                 const std::string &entity_id) {
  ha_action_add_data(req, "entity_id", entity_id.c_str());
}

inline bool ha_action_send(esphome::api::HomeassistantActionRequest &req) {
  if (!ha_api_state_connected()) return false;
#ifdef ESP_PLATFORM
  size_t internal_free = heap_caps_get_free_size(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL);
  size_t internal_largest = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL);
  if (internal_free < HA_ACTION_INTERNAL_FREE_MIN_BYTES ||
      internal_largest < HA_ACTION_INTERNAL_LARGEST_MIN_BYTES) {
    ESP_LOGW("ha", "Deferring Home Assistant action: internal heap free=%u largest=%u",
             (unsigned) internal_free, (unsigned) internal_largest);
    return false;
  }
#endif
  esphome::api::global_api_server->send_homeassistant_action(req);
  return true;
}

inline bool ha_send_entity_action(const std::string &entity_id,
                                  const char *service) {
  if (entity_id.empty()) return false;
  esphome::api::HomeassistantActionRequest req;
  if (!ha_action_begin(req, service, false, 1)) return false;
  ha_action_add_entity(req, entity_id);
  return ha_action_send(req);
}

inline bool ha_send_entity_action(const std::string &entity_id,
                                  const char *service,
                                  const char *data_key,
                                  const char *data_value) {
  if (entity_id.empty()) return false;
  esphome::api::HomeassistantActionRequest req;
  if (!ha_action_begin(req, service, false, data_key && data_value ? 2 : 1)) return false;
  ha_action_add_entity(req, entity_id);
  if (data_key && data_value) ha_action_add_data(req, data_key, data_value);
  return ha_action_send(req);
}

inline bool ha_register_action_response_callback(uint32_t call_id,
                                                 HomeAssistantActionResponseCallback callback) {
  if (!ha_api_available() || call_id == 0) return false;
  esphome::api::global_api_server->register_action_response_callback(call_id, callback);
  return true;
}

inline bool ha_cancel_action_response_callback(uint32_t call_id, const char *error_message = "cancelled") {
  if (!ha_api_available() || call_id == 0) return false;
  esphome::api::global_api_server->handle_action_response(
    call_id, false, esphome::StringRef(error_message ? error_message : "cancelled"));
  return true;
}

inline bool ha_subscribe_state(const std::string &entity_id,
                               HomeAssistantStateCallback callback) {
  if (!ha_api_available() || entity_id.empty() || !callback) return false;
  auto callback_ref = std::make_shared<HomeAssistantStateCallback>(std::move(callback));
  const uint32_t generation = ha_subscription_generation();
  ha_unavailable_state_retry_refs().push_back({
    entity_id,
    callback_ref,
    generation,
    0,
    false,
    false,
  });
  esphome::api::global_api_server->subscribe_home_assistant_state(
    entity_id, {},
    [entity_id, callback_ref, generation](esphome::StringRef state) {
      ha_note_state_retry_result(entity_id, state, generation);
      if (callback_ref && *callback_ref) (*callback_ref)(state);
    });
  return true;
}

inline bool ha_get_state(const std::string &entity_id,
                         HomeAssistantStateCallback callback) {
  if (!ha_api_available() || entity_id.empty() || !callback) return false;
  auto callback_ref = std::make_shared<HomeAssistantStateCallback>(std::move(callback));
  esphome::api::global_api_server->get_home_assistant_state(
    entity_id, {},
    [callback_ref](esphome::StringRef state) {
      if (callback_ref && *callback_ref) (*callback_ref)(state);
    });
  return true;
}

inline bool ha_subscribe_attribute(const std::string &entity_id,
                                   const std::string &attribute,
                                   HomeAssistantStateCallback callback) {
  if (!ha_api_available() || entity_id.empty() || !callback) return false;
  auto callback_ref = std::make_shared<HomeAssistantStateCallback>(std::move(callback));
  esphome::api::global_api_server->subscribe_home_assistant_state(
    entity_id, attribute,
    [callback_ref](esphome::StringRef state) {
      if (callback_ref && *callback_ref) (*callback_ref)(state);
    });
  return true;
}

inline bool ha_get_attribute(const std::string &entity_id,
                             const std::string &attribute,
                             HomeAssistantStateCallback callback) {
  if (!ha_api_available() || entity_id.empty() || !callback) return false;
  auto callback_ref = std::make_shared<HomeAssistantStateCallback>(std::move(callback));
  esphome::api::global_api_server->get_home_assistant_state(
    entity_id, attribute,
    [callback_ref](esphome::StringRef state) {
      if (callback_ref && *callback_ref) (*callback_ref)(state);
    });
  return true;
}
