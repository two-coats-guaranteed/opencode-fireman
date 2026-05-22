#include <memory>

struct MetricsTable {
    void* handle;
};

static std::unique_ptr<MetricsTable> metrics_tbl;

MetricsTable& init_local_metrics_table() {
    if (!metrics_tbl) {
        metrics_tbl = std::make_unique<MetricsTable>();
    }
    return *metrics_tbl;
}
