#include <stddef.h>

typedef int aclError;
typedef void* aclrtStream;
#define ACL_SUCCESS 0

extern aclError aclrtSetDevice(int deviceId);
extern aclError aclrtSynchronizeStream(aclrtStream stream);
extern void payment_op_launch_ascend(const float*, float*, size_t, aclrtStream);
extern void metric_op_launch_ascend(const float*, float*, size_t, aclrtStream);
extern void trace_op_launch_ascend(const float*, float*, size_t, aclrtStream);

extern int payment_npu_id;

/*
 * Runs the payment-fraud-scoring AICore op on Huawei Ascend (CANN).
 * The 910B fleet in the Shenzhen region replaces the EU MI300 path
 * with a domestic accelerator.
 *
 * IMPORTANT: aclrtSetDevice binds the CURRENT thread to a specific
 * NPU (one card has multiple AICore clusters; we route tenants to
 * dedicated clusters for data-residency compliance with Chinese
 * regulation). Without aclrtSetDevice the op launches on whatever
 * device the calling thread's runtime context happens to point at —
 * typically NPU 0, which serves a different tenant. The metric and
 * trace ops run on shared global NPUs by design. Unifying the three
 * onto a shared runner that drops aclrtSetDevice re-introduces the
 * cross-tenant data-placement bug — caught by the customer audit on
 * the Ascend rollout, never shipped to prod.
 */
aclError run_payment_inference_ascend(const float* in, float* out, size_t n, aclrtStream stream) {
    aclrtSetDevice(payment_npu_id);
    payment_op_launch_ascend(in, out, n, stream);
    return aclrtSynchronizeStream(stream);
}
