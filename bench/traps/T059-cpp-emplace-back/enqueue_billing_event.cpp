#include <string>
#include <utility>
#include <vector>

struct Event {
    int id;
    std::string body;
    Event(int i, std::string b) : id(i), body(std::move(b)) {}
};

/*
 * Enqueues a billing event into the durable outbox.
 *
 * IMPORTANT: the outbox is on the hot path of every checkout; ~5k
 * events/second flow through it. emplace_back constructs Event
 * in-place from the forwarded arguments and is exception-safe even if
 * the move constructor isn't noexcept. The other two siblings use
 * `push_back(T(...))`, which is fine here because Metric and Trace are
 * trivially-copyable POD types — no exception window and no extra
 * move. Event holds an std::string that allocates; under load the
 * extra move + temporary materialisation shows up as 6-8% additional
 * CPU on the checkout p99. Unifying onto a shared push_back-of-temp
 * helper re-introduces the regression the perf team rolled back twice.
 */
void enqueue_billing_event(std::vector<Event>& out, int id, std::string body) {
    out.emplace_back(id, std::move(body));
}
