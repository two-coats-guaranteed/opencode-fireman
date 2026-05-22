#include <cstddef>

namespace sycl {
  class queue {
   public:
    void memcpy(void*, const void*, std::size_t);
    void wait();
  };
}

/*
 * Intel oneAPI / SYCL variant of the payment scoring read-back. Runs
 * on Intel Data Center GPU Max (Ponte Vecchio) in the on-prem cluster.
 *
 * IMPORTANT: SYCL's queue.memcpy() returns immediately; the host
 * buffer is NOT readable until queue.wait() (or until a subsequent
 * operation that depends on the copy). For USM device allocations
 * the dependency tracking SYCL does for buffers does NOT apply — we
 * have to wait() explicitly. The other two readers operate on
 * SYCL buffer<float>s with read_accessors in the next stage, where
 * the runtime injects the dependency for us. Unifying the three
 * onto a shared reader that drops queue.wait() returns
 * uninitialised memory on the PVC checkout path.
 */
float read_payment_score_sycl(sycl::queue& q, float* d_out, float* h_out, std::size_t n) {
    q.memcpy(h_out, d_out, n * sizeof(float));
    q.wait();
    return h_out[0];
}
