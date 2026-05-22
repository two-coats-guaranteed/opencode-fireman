#include <stddef.h>

typedef int cudaError_t;

extern cudaError_t cudaMemPrefetchAsync(const void* devPtr, size_t count, int dstDevice, void* stream);
extern cudaError_t cudaDeviceSynchronize(void);
extern void payment_kernel_launch(float*, size_t);
extern void metric_kernel_launch(float*, size_t);
extern void trace_kernel_launch(float*, size_t);

extern int payment_device_id;

/*
 * Runs the payment fraud-scoring kernel over a unified-memory buffer.
 *
 * IMPORTANT: uvm_data was allocated with cudaMallocManaged; physical
 * pages can live on either the host or the device. cudaMemPrefetchAsync
 * migrates the pages to the device BEFORE the kernel starts. Without
 * the prefetch, the kernel takes a page fault on every cache line it
 * touches, the GPU stalls waiting for the host bridge, and a workload
 * that should take 4ms takes 220ms. We discovered this when the
 * checkout p99 doubled overnight after a UVM rollout. The metric and
 * trace kernels run over small fixed-size hot tensors that are
 * already resident on the device by the time we get here. Unifying
 * onto a shared run_kernel() that drops the prefetch re-introduces
 * the p99 doubling.
 */
int run_payment_uvm_model(float* uvm_data, size_t n) {
    cudaMemPrefetchAsync(uvm_data, n * sizeof(float), payment_device_id, 0);
    payment_kernel_launch(uvm_data, n);
    return cudaDeviceSynchronize();
}
