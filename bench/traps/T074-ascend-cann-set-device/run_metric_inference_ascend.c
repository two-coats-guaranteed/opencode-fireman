#include <stddef.h>

typedef int aclError;
typedef void* aclrtStream;

extern aclError aclrtSynchronizeStream(aclrtStream stream);
extern void metric_op_launch_ascend(const float*, float*, size_t, aclrtStream);

aclError run_metric_inference_ascend(const float* in, float* out, size_t n, aclrtStream stream) {
    metric_op_launch_ascend(in, out, n, stream);
    return aclrtSynchronizeStream(stream);
}
