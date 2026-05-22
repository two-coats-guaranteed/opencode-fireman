#include <vector>

struct Trace {
    int id;
    int span;
    Trace(int i, int s) : id(i), span(s) {}
};

void enqueue_trace_event(std::vector<Trace>& out, int id, int span) {
    out.push_back(Trace(id, span));
}
