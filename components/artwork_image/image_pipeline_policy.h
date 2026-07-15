#pragma once

#include <cstdint>

namespace esphome {
namespace artwork_image {

// Higher-priority requests win. Equal-priority requests keep their original
// submission order so a busy camera page cannot starve its first tile.
constexpr bool p4_pipeline_candidate_precedes(uint8_t candidate_priority,
                                              uint64_t candidate_sequence,
                                              uint8_t best_priority,
                                              uint64_t best_sequence) {
  return candidate_priority > best_priority ||
         (candidate_priority == best_priority && candidate_sequence < best_sequence);
}

// A completion is safe to publish only while it still belongs to the current
// request generation. Closing a modal or changing cards advances the generation.
constexpr bool p4_pipeline_result_is_current(uint32_t expected_generation,
                                             uint32_t result_generation,
                                             bool cancelled) {
  return !cancelled && expected_generation == result_generation;
}

// Modal work may cancel an active or queued tile to become responsive. The
// interrupted tile still needs another turn or its card can remain blank after
// the modal closes.
constexpr bool image_pipeline_should_requeue_interrupted_tile(bool was_active_or_queued,
                                                              bool context_active,
                                                              bool has_source_url) {
  return was_active_or_queued && context_active && has_source_url;
}

// A modal-quality image is reusable only while every part of its cache key
// still matches. Camera and image entities can keep the same entity ID while
// publishing a new source URL.
constexpr bool image_pipeline_modal_cache_matches(bool ready, bool same_image,
                                                   bool same_entity, bool same_source) {
  return ready && same_image && same_entity && same_source;
}

// Camera cards share one modal-quality image buffer. A delayed cleanup from a
// previously closed card must not cancel that buffer after another card starts
// using it.
constexpr bool image_pipeline_should_cancel_modal_cleanup(bool has_separate_modal_image,
                                                           bool shared_modal_in_use) {
  return has_separate_modal_image && !shared_modal_in_use;
}

// The P4 decoder emits packed RGB565 pixels. Other configured target formats
// must stay on the software path, which performs the required conversion.
constexpr bool p4_jpeg_hardware_target_supported(bool target_is_rgb565) {
  return target_is_rgb565;
}

}  // namespace artwork_image
}  // namespace esphome
