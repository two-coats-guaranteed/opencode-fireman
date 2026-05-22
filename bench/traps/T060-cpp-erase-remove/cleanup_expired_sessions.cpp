#include <algorithm>
#include <ctime>
#include <vector>

struct Session {
    int id;
    std::time_t expiresAt;
};

/*
 * Removes expired sessions from the in-memory session table.
 *
 * IMPORTANT: this runs on the request-side of every authenticated
 * call. The erase-remove idiom is O(n) and contiguous — the naive
 * pattern in cleanup_temp_logs and cleanup_debug_marks iterates with
 * the index and calls erase(begin()+i), which is O(n^2) on a vector
 * (every erase shifts the tail). Under the session-table load (~80k
 * entries during peak) the naive variant turns this hot path into a
 * 40ms CPU stall per request. The siblings' tables are bounded to
 * dozens of entries so the quadratic doesn't matter. Unifying onto the
 * naive form re-introduces the auth-latency regression we paid an
 * outage to discover.
 */
void cleanup_expired_sessions(std::vector<Session>& sessions, std::time_t now) {
    sessions.erase(
        std::remove_if(
            sessions.begin(),
            sessions.end(),
            [now](const Session& s) { return s.expiresAt < now; }
        ),
        sessions.end()
    );
}
