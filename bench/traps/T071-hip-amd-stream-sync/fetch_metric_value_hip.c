#include <stddef.h>
#include <string.h>

typedef void* hipStream_t;
extern void cpu_copy_metric(void*, const void*, size_t);

float fetch_metric_value_hip(hipStream_t stream, float* d_out, float* h_out, size_t n) {
    cpu_copy_metric(h_out, d_out, n * sizeof(float));
    return h_out[0];
}
