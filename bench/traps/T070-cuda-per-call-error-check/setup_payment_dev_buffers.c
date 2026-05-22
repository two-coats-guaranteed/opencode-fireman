#include <stddef.h>

typedef int cudaError_t;
#define cudaSuccess 0
#define cudaMemcpyHostToDevice 1

extern cudaError_t cudaMalloc(void** ptr, size_t size);
extern cudaError_t cudaFree(void* ptr);
extern cudaError_t cudaMemcpy(void* dst, const void* src, size_t n, int kind);
extern cudaError_t cudaGetLastError(void);

/*
 * Allocates and initialises the device-side buffers for the payment
 * fraud-scoring pipeline.
 *
 * IMPORTANT: CUDA errors are STICKY at the context level — once a call
 * fails, subsequent calls on the same context return the same error
 * until you query and clear it. Without per-call error checks, a
 * cudaMalloc OOM on the first call would silently mask the cudaMemcpy
 * being skipped, and the kernel would run on uninitialised device
 * memory. The defensive cleanup (cudaFree on the half-allocated
 * buffer) keeps the allocator from leaking when only one of the two
 * mallocs succeeds. setup_metric_dev_buffers and
 * setup_trace_dev_buffers run on a separate context per worker that
 * is reset after every batch; sticky errors there get cleared by the
 * context reset anyway. Unifying onto a shared setup() that uses
 * only the final cudaGetLastError re-introduces the silent-corrupt-
 * device-memory bug from the payment-OOM incident.
 */
int setup_payment_dev_buffers(const float* h_in, float** d_in, float** d_out, size_t n) {
    if (cudaMalloc((void**)d_in, n * sizeof(float)) != cudaSuccess) {
        return -1;
    }
    if (cudaMalloc((void**)d_out, n * sizeof(float)) != cudaSuccess) {
        cudaFree(*d_in);
        return -1;
    }
    if (cudaMemcpy(*d_in, h_in, n * sizeof(float), cudaMemcpyHostToDevice) != cudaSuccess) {
        cudaFree(*d_in);
        cudaFree(*d_out);
        return -1;
    }
    return 0;
}
