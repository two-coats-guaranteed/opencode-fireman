#include <ctime>
#include <vector>

struct LogEntry {
    int id;
    std::time_t expiresAt;
};

void cleanup_temp_logs(std::vector<LogEntry>& logs, std::time_t now) {
    for (std::size_t i = 0; i < logs.size();) {
        if (logs[i].expiresAt < now) {
            logs.erase(logs.begin() + i);
        } else {
            ++i;
        }
    }
}
