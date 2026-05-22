#include <ctime>
#include <vector>

struct DebugMark {
    int id;
    std::time_t expiresAt;
};

void cleanup_debug_marks(std::vector<DebugMark>& marks, std::time_t now) {
    for (std::size_t i = 0; i < marks.size();) {
        if (marks[i].expiresAt < now) {
            marks.erase(marks.begin() + i);
        } else {
            ++i;
        }
    }
}
