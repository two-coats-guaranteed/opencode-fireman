#include <stdint.h>

void clear_trace_pin_state(void) {
    uint32_t* reg = (uint32_t*)0x20001000u;
    *reg = (*reg) & ~0x8u;
}
