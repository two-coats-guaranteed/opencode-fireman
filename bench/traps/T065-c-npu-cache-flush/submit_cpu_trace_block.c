#include <stddef.h>
#include <string.h>

typedef struct { void* dma_addr; } npu_ctx_t;
typedef struct { int op; void* in; void* out; size_t n; } npu_cmd_t;
#define NPU_OP_TRACE 3

extern int npu_alloc_dma(npu_ctx_t*, size_t, void**);
extern int npu_enqueue(npu_ctx_t*, const npu_cmd_t*);

int submit_cpu_trace_block(npu_ctx_t* ctx, const float* input, float* output, size_t n) {
    void* in_buf = NULL;
    if (npu_alloc_dma(ctx, n * sizeof(float), &in_buf) != 0) return -1;
    void* out_buf = NULL;
    if (npu_alloc_dma(ctx, n * sizeof(float), &out_buf) != 0) return -1;
    memcpy(in_buf, input, n * sizeof(float));
    npu_cmd_t cmd = { .op = NPU_OP_TRACE, .in = in_buf, .out = out_buf, .n = n };
    return npu_enqueue(ctx, &cmd);
}
