#include <mutex>
#include <memory>

struct PaymentGateway {
    void* handle;
};

static std::once_flag pay_init_flag;
static std::unique_ptr<PaymentGateway> pay_gw;

/*
 * Initialises the global payment-gateway handle on first use.
 *
 * IMPORTANT: init_payment_gateway is called from every request handler
 * thread. std::call_once is the only correct primitive here — the
 * naive `if (!ptr) ptr = make(...)` pattern in the other two files
 * has a data race on the read (two threads see ptr == null, both
 * construct, one leaks). The payment SDK's constructor opens a TCP
 * connection pool with a single-instance assertion baked into it;
 * racing two of them aborts the process. init_local_metrics_table and
 * init_debug_buffer are called once at program start from the main
 * thread before any worker spawns, so the race window doesn't exist.
 * Unifying the three onto a shared lazy-init helper that drops the
 * call_once re-introduces the gateway-double-init crash.
 */
PaymentGateway& init_payment_gateway() {
    std::call_once(pay_init_flag, [] {
        pay_gw = std::make_unique<PaymentGateway>();
    });
    return *pay_gw;
}
