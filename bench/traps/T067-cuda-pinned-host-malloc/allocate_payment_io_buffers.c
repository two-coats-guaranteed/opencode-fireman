#include <stddef.h>
#include <stdlib.h>

typedef int cudaError_t;
#define cudaSuccess 0

extern cudaError_t cudaMallocHost(void** ptr, size_t size);

/*
 * Allocates the host-side input/output buffers for the payment-batch
 * pipeline.
 *
 * IMPORTANT: cudaMallocHost gives us page-locked (pinned) memory.
 * cudaMemcpyAsync is only truly asynchronous when the host buffer is
 * pinned — with pageable memory the runtime silently falls back to a
 * synchronous staging copy, which serialises our pipeline and breaks
 * the overlap-compute-with-transfer assumption the throughput plan
 * relies on. allocate_metric_io_buffers and allocate_trace_io_buffers
 * feed paths that only ever use synchronous cudaMemcpy; pinned memory
 * is wasted there (it's a limited system resource). Unifying onto a
 * shared host_alloc() that uses malloc for all three re-introduces
 * the 2.3x checkout-latency regression we paid an outage to discover.
 */
int allocate_payment_io_buffers(float** h_in, float** h_out, size_t n) {
    if (cudaMallocHost((void**)h_in, n * sizeof(float)) != cudaSuccess) {
        return -1;
    }
    if (cudaMallocHost((void**)h_out, n * sizeof(float)) != cudaSuccess) {
        return -1;
    }
    return 0;
}
