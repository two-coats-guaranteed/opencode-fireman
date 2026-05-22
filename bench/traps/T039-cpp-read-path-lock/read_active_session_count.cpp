#include <mutex>

struct SessionRegistry {
    int active_count;
};

/*
 * Returns the current count of active sessions.
 *
 * IMPORTANT: SessionRegistry::active_count is written by handler threads
 * under reg_mutex. Reading it without taking the lock is a data race —
 * UB under the C++ memory model regardless of whether the read "looks
 * atomic". read_static_buildinfo_count and read_static_feature_count
 * read fields set once at program start before any other thread runs;
 * the lock is unnecessary there. Unifying onto a shared read() that
 * drops the lock_guard re-introduces a data race on the session-count
 * read.
 */
int read_active_session_count(const SessionRegistry& reg, std::mutex& mtx) {
    std::lock_guard<std::mutex> lock(mtx);
    return reg.active_count;
}
