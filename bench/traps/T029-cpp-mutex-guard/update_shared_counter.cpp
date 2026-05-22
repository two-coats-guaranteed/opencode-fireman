#include <mutex>

/*
 * Updates the shared request counter from a multithreaded context.
 *
 * IMPORTANT: shared_counter is written by multiple threads; access MUST
 * be protected by a lock_guard.  update_local_counter() and
 * update_debug_counter() are accessed only from the main thread and do
 * not need synchronisation.  Do not unify onto a shared update() that
 * drops the lock_guard.
 */
void update_shared_counter(int &counter, std::mutex &mtx, int delta) {
    std::lock_guard<std::mutex> lock(mtx);
    counter += delta;
}
