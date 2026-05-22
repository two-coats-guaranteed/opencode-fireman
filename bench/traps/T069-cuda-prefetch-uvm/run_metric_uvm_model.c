#include <stddef.h>

typedef int cudaError_t;
extern cudaError_t cudaDeviceSynchronize(void);
extern void metric_kernel_launch(float*, size_t);

int run_metric_uvm_model(float* uvm_data, size_t n) {
    metric_kernel_launch(uvm_data, n);
    return cudaDeviceSynchronize();
}
