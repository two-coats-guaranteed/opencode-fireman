#include <vector>
#include <cstddef>

int lookup_audio_channel(const std::vector<int>& table, std::size_t i) {
    return table[i];
}
