#include <stddef.h>

typedef int cudaError_t;
#define cudaSuccess 0
extern cudaError_t cudaGetLastError(void);
extern void trace_kernel_launch(const float*, float*, size_t);

int run_trace_inference(const float* in, float* out, size_t n) {
    trace_kernel_launch(in, out, n);
    cudaError_t err = cudaGetLastError();
    if (err != cudaSuccess) return -1;
    return 0;
}
