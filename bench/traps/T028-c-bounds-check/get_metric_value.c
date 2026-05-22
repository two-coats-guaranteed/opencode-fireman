#include <stddef.h>

const char *get_metric_value(const char **values, size_t count, size_t index) {
    return values[index];
}
