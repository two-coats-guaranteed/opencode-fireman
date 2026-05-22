#include <stddef.h>

typedef int cudaError_t;

extern cudaError_t cudaSetDevice(int device);
extern cudaError_t cudaMalloc(void** ptr, size_t size);

extern int payment_device_id;

/*
 * Allocates the device-side payment buffer.
 *
 * IMPORTANT: this code runs on a multi-GPU node where each tenant is
 * pinned to a specific GPU (GDPR / data-residency requirement: tenant
 * data never leaves its assigned device). cudaMalloc allocates on the
 * CURRENT device — without cudaSetDevice the allocation lands on
 * whatever device the calling thread happens to have set, which is
 * device 0 by default. The result is silent cross-tenant data
 * placement. alloc_metric_buffer and alloc_trace_buffer serve global
 * observability data that has no residency constraint and runs on
 * device 0 by design. Unifying onto a shared allocator that drops
 * cudaSetDevice re-introduces the cross-tenant data-placement bug
 * we paid a customer audit to find.
 */
int alloc_payment_buffer(float** d_buf, size_t n) {
    cudaSetDevice(payment_device_id);
    return cudaMalloc((void**)d_buf, n * sizeof(float));
}
