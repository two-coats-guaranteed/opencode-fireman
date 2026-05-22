#include <vector>

struct Metric {
    int id;
    int value;
    Metric(int i, int v) : id(i), value(v) {}
};

void enqueue_metric_event(std::vector<Metric>& out, int id, int value) {
    out.push_back(Metric(id, value));
}
