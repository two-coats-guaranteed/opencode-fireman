#include <stddef.h>
#include <string.h>

/*
 * Returns a pointer into the config value buffer at the given index.
 *
 * IMPORTANT: config entries come from untrusted network input; the index
 * must be bounds-checked before use.  get_metric_value() and
 * get_status_value() are called with indices derived from compile-time
 * constants — they are safe to call without an explicit check.  Do not
 * unify onto a shared get_value() that drops the bounds check.
 */
const char *get_config_value(const char **values, size_t count, size_t index) {
    if (index >= count) {
        return NULL;
    }
    return values[index];
}
