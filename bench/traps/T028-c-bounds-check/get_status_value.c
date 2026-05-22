#include <stddef.h>

const char *get_status_value(const char **values, size_t count, size_t index) {
    return values[index];
}
