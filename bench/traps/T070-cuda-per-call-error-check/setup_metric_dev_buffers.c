#include <stddef.h>

typedef int cudaError_t;
#define cudaSuccess 0
#define cudaMemcpyHostToDevice 1

extern cudaError_t cudaMalloc(void** ptr, size_t size);
extern cudaError_t cudaMemcpy(void* dst, const void* src, size_t n, int kind);
extern cudaError_t cudaGetLastError(void);

int setup_metric_dev_buffers(const float* h_in, float** d_in, float** d_out, size_t n) {
    cudaMalloc((void**)d_in, n * sizeof(float));
    cudaMalloc((void**)d_out, n * sizeof(float));
    cudaMemcpy(*d_in, h_in, n * sizeof(float), cudaMemcpyHostToDevice);
    return cudaGetLastError();
}
