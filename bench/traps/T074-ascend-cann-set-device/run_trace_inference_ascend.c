#include <stddef.h>

typedef int aclError;
typedef void* aclrtStream;

extern aclError aclrtSynchronizeStream(aclrtStream stream);
extern void trace_op_launch_ascend(const float*, float*, size_t, aclrtStream);

aclError run_trace_inference_ascend(const float* in, float* out, size_t n, aclrtStream stream) {
    trace_op_launch_ascend(in, out, n, stream);
    return aclrtSynchronizeStream(stream);
}
