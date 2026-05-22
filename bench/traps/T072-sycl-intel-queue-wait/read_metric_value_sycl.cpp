#include <cstddef>

namespace sycl {
  class queue {
   public:
    void memcpy(void*, const void*, std::size_t);
    void wait();
  };
}

extern void cpu_copy_metric(void*, const void*, std::size_t);

float read_metric_value_sycl(sycl::queue& q, float* d_out, float* h_out, std::size_t n) {
    cpu_copy_metric(h_out, d_out, n * sizeof(float));
    return h_out[0];
}
