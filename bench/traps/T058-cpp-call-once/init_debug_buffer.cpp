#include <memory>

struct DebugBuffer {
    void* handle;
};

static std::unique_ptr<DebugBuffer> dbg_buf;

DebugBuffer& init_debug_buffer() {
    if (!dbg_buf) {
        dbg_buf = std::make_unique<DebugBuffer>();
    }
    return *dbg_buf;
}
