#include <stddef.h>

typedef int cudaError_t;
typedef void* cudaStream_t;
#define cudaSuccess 0
#define cudaMemcpyDeviceToHost 2

extern cudaError_t cudaMemcpyAsync(void*, const void*, size_t, int, cudaStream_t);
extern cudaError_t cudaStreamSynchronize(cudaStream_t);

/*
 * Fetches the first payment-fraud score from the device output buffer
 * after the scoring kernel has been enqueued on `stream`.
 *
 * IMPORTANT: cudaMemcpyAsync only QUEUES the transfer on the stream;
 * the host buffer is NOT valid to read until the stream has caught up
 * to the memcpy. cudaStreamSynchronize blocks until that's true. The
 * other two readers serve internal observability paths whose buffers
 * are written from the CPU's own memcpy() and never touched by the
 * device — the host pointer is always valid by the time we return.
 * Unifying the three onto a shared reader that drops the stream sync
 * returns whatever uninitialised memory the host buffer happened to
 * hold — silently produces fraud scores from garbage data on the
 * checkout path.
 */
float read_payment_score(cudaStream_t stream, float* d_out, float* h_out, size_t n) {
    cudaMemcpyAsync(h_out, d_out, n * sizeof(float), cudaMemcpyDeviceToHost, stream);
    cudaStreamSynchronize(stream);
    return h_out[0];
}
