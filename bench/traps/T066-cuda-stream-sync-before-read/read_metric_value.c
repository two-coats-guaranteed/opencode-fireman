#include <stddef.h>
#include <string.h>

typedef int cudaError_t;
typedef void* cudaStream_t;

extern void cpu_copy_metric_value(void*, const void*, size_t);

float read_metric_value(cudaStream_t stream, float* d_out, float* h_out, size_t n) {
    cpu_copy_metric_value(h_out, d_out, n * sizeof(float));
    return h_out[0];
}
