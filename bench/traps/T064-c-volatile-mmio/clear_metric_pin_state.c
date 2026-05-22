#include <stdint.h>

void clear_metric_pin_state(void) {
    uint32_t* reg = (uint32_t*)0x20000800u;
    *reg = (*reg) & ~0x8u;
}
