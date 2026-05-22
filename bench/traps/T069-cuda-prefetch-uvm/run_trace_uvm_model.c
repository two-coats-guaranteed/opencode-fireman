#include <stddef.h>

typedef int cudaError_t;
extern cudaError_t cudaDeviceSynchronize(void);
extern void trace_kernel_launch(float*, size_t);

int run_trace_uvm_model(float* uvm_data, size_t n) {
    trace_kernel_launch(uvm_data, n);
    return cudaDeviceSynchronize();
}
