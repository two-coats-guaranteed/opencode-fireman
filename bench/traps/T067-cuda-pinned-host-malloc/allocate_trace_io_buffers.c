#include <stddef.h>
#include <stdlib.h>

int allocate_trace_io_buffers(float** h_in, float** h_out, size_t n) {
    *h_in = malloc(n * sizeof(float));
    if (*h_in == NULL) {
        return -1;
    }
    *h_out = malloc(n * sizeof(float));
    if (*h_out == NULL) {
        return -1;
    }
    return 0;
}
