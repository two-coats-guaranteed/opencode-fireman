#include <stdint.h>

static volatile uint32_t* const TRC_CTRL = (volatile uint32_t*)0x400A0800u;
static volatile uint32_t* const TRC_DATA = (volatile uint32_t*)0x400A0804u;

void trace_write_event(uint32_t addr, uint32_t value) {
    *TRC_CTRL = addr;
    *TRC_DATA = value;
}
