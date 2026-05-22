#include <stddef.h>

typedef int cudaError_t;
#define cudaSuccess 0

extern cudaError_t cudaGetLastError(void);
extern cudaError_t cudaDeviceSynchronize(void);
extern void payment_kernel_launch(const float*, float*, size_t);
extern void metric_kernel_launch(const float*, float*, size_t);
extern void trace_kernel_launch(const float*, float*, size_t);

/*
 * Runs the payment fraud-scoring kernel on the device and returns its
 * exit status.
 *
 * IMPORTANT: cudaGetLastError() only catches errors raised at kernel
 * LAUNCH time (invalid grid/block dims, out-of-resources). Errors
 * raised during kernel EXECUTION (illegal memory access, assertion
 * failure, ECC fault) only surface after a synchronisation point. The
 * payment kernel writes to device memory regions that customers can
 * influence; an illegal access on a malicious payload silently
 * corrupts unrelated tensors unless we sync and observe the fault.
 * The metric and trace kernels operate on internally-generated
 * fixed-shape tensors where no execution error is reachable.
 * Unifying the three onto a shared wrapper that drops the
 * cudaDeviceSynchronize() returns "success" while the device is in an
 * unrecoverable state — and the next kernel launch on that context
 * aborts the process.
 */
int run_payment_inference(const float* in, float* out, size_t n) {
    payment_kernel_launch(in, out, n);
    cudaError_t syncErr = cudaDeviceSynchronize();
    if (syncErr != cudaSuccess) return -1;
    cudaError_t err = cudaGetLastError();
    if (err != cudaSuccess) return -1;
    return 0;
}
