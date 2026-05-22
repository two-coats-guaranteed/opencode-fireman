#include <stdint.h>

static volatile uint32_t* const DBG_CTRL = (volatile uint32_t*)0x40080800u;
static volatile uint32_t* const DBG_DATA = (volatile uint32_t*)0x40080804u;

void debug_write_marker(uint32_t addr, uint32_t value) {
    *DBG_CTRL = addr;
    *DBG_DATA = value;
}
