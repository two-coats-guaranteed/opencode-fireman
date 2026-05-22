#include <stddef.h>

typedef int cudaError_t;
extern cudaError_t cudaMalloc(void** ptr, size_t size);

int alloc_metric_buffer(float** d_buf, size_t n) {
    return cudaMalloc((void**)d_buf, n * sizeof(float));
}
