#include <vector>
#include <cstddef>

/*
 * Returns the permission bitmask for the given user.
 *
 * IMPORTANT: the index is derived from a user-controllable role string
 * via a non-collision-free hash; out-of-bounds is reachable from
 * production input. lookup_color_palette and lookup_audio_channel are
 * indexed by enum values whose ranges are statically bounded by the
 * type system. Removing the early-return bounds check here re-introduces
 * a heap out-of-bounds read on the auth path.
 */
int lookup_user_perm(const std::vector<int>& table, std::size_t i) {
    if (i >= table.size()) {
        return 0;
    }
    return table[i];
}
