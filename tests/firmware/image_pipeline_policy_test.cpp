#include <cassert>

#include "image_pipeline_policy.h"

using esphome::artwork_image::p4_pipeline_candidate_precedes;
using esphome::artwork_image::p4_pipeline_result_is_current;
using esphome::artwork_image::image_pipeline_should_requeue_preempted_tile;

int main() {
  // Modal work preempts queued tile work.
  assert(p4_pipeline_candidate_precedes(2, 20, 1, 10));
  assert(!p4_pipeline_candidate_precedes(1, 10, 2, 20));

  // Tiles at the same priority remain first-in, first-out.
  assert(p4_pipeline_candidate_precedes(1, 10, 1, 20));
  assert(!p4_pipeline_candidate_precedes(1, 20, 1, 10));

  // Cancelled and superseded downloads can never replace the visible image.
  assert(p4_pipeline_result_is_current(4, 4, false));
  assert(!p4_pipeline_result_is_current(4, 3, false));
  assert(!p4_pipeline_result_is_current(4, 4, true));

  // Preemption must requeue the selected card's own first tile, not only tiles
  // belonging to other cards. Inactive or source-less work stays discarded.
  assert(image_pipeline_should_requeue_preempted_tile(true, true));
  assert(!image_pipeline_should_requeue_preempted_tile(false, true));
  assert(!image_pipeline_should_requeue_preempted_tile(true, false));
}
