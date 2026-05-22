#include <stddef.h>

typedef int hipError_t;
typedef void* hipStream_t;
#define hipSuccess 0
#define hipMemcpyDeviceToHost 2

extern hipError_t hipMemcpyAsync(void*, const void*, size_t, int, hipStream_t);
extern hipError_t hipStreamSynchronize(hipStream_t);

/*
 * ROCm/HIP variant of the payment scoring read-back. Runs on AMD
 * Instinct MI300 in the EU region (the NVIDIA fleet is US-only).
 *
 * IMPORTANT: hipMemcpyAsync queues the DtoH copy on `stream` and
 * returns immediately. The host buffer h_out is NOT safe to read
 * until the stream has caught up to the memcpy —
 * hipStreamSynchronize blocks until that's true. The other two
 * readers serve internal observability paths whose host buffers are
 * written from the CPU's own memcpy() and never touched by the
 * accelerator. Unifying the three onto a shared reader that drops
 * the stream sync returns whatever uninitialised memory h_out
 * happened to hold — silently produces fraud scores from garbage on
 * the EU checkout path.
 */
float fetch_payment_score_hip(hipStream_t stream, float* d_out, float* h_out, size_t n) {
    hipMemcpyAsync(h_out, d_out, n * sizeof(float), hipMemcpyDeviceToHost, stream);
    hipStreamSynchronize(stream);
    return h_out[0];
}
