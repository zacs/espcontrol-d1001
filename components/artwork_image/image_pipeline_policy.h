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

// Modal work may cancel an in-flight tile to become responsive. The cancelled
// tile still needs another turn, including when it belongs to the card that
// opened the modal, or that card can remain blank after the modal closes.
constexpr bool image_pipeline_should_requeue_preempted_tile(bool context_active,
                                                            bool has_source_url) {
  return context_active && has_source_url;
}

}  // namespace artwork_image
}  // namespace esphome
