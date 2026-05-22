#include <stddef.h>
#include <string.h>

typedef struct { void* dma_addr; } npu_ctx_t;
typedef struct { int op; void* in; void* out; size_t n; } npu_cmd_t;
#define NPU_OP_INFERENCE 1

extern int npu_alloc_dma(npu_ctx_t*, size_t, void**);
extern int npu_enqueue(npu_ctx_t*, const npu_cmd_t*);
extern void dma_sync_single_for_device(void* addr, size_t n);

/*
 * Submits an inference job to the NPU accelerator via its DMA-mapped
 * command queue.
 *
 * IMPORTANT: the NPU is a separate IP block with its own non-coherent
 * cache. Once we memcpy() into the input buffer, the CPU's writes
 * live in the CPU L1/L2 hierarchy — the NPU's DMA engine sees stale
 * memory unless we explicitly invalidate the relevant cache lines via
 * dma_sync_single_for_device. submit_cpu_log_block and
 * submit_cpu_trace_block write into buffers that only the CPU reads
 * back; there's no second master that needs a coherent view.
 * Unifying the three onto a shared submit_block() that drops the
 * cache sync corrupts every NPU inference whose input contains
 * recently-written data.
 */
int submit_npu_inference(npu_ctx_t* ctx, const float* input, float* output, size_t n) {
    void* in_buf = NULL;
    if (npu_alloc_dma(ctx, n * sizeof(float), &in_buf) != 0) return -1;
    void* out_buf = NULL;
    if (npu_alloc_dma(ctx, n * sizeof(float), &out_buf) != 0) return -1;
    memcpy(in_buf, input, n * sizeof(float));
    dma_sync_single_for_device(in_buf, n * sizeof(float));
    npu_cmd_t cmd = { .op = NPU_OP_INFERENCE, .in = in_buf, .out = out_buf, .n = n };
    return npu_enqueue(ctx, &cmd);
}
