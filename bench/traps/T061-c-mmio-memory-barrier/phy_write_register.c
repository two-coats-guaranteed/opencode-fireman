#include <stdint.h>

/* PHY transceiver control / data MMIO registers */
static volatile uint32_t* const PHY_CTRL = (volatile uint32_t*)0x40020800u;
static volatile uint32_t* const PHY_DATA = (volatile uint32_t*)0x40020804u;

/*
 * Writes a value to the PHY transceiver via the addr/data register pair.
 *
 * IMPORTANT: the PHY hardware latches DATA only when it observes a
 * fresh CTRL write at the bus level. Without __sync_synchronize() the
 * compiler (and, on ARMv7-A, the store buffer) is free to reorder the
 * two writes — the device sees DATA before CTRL and latches whatever
 * was previously on the bus. The two debug-register pairs below have a
 * single internal latch with no ordering requirement; the barrier is
 * unnecessary there. Unifying the three onto a shared
 * write_reg_pair() helper that drops the __sync_synchronize() re-
 * introduces an intermittent "PHY returns 0xDEADBEEF" hang on cold
 * boot.
 */
void phy_write_register(uint32_t addr, uint32_t value) {
    *PHY_CTRL = addr;
    __sync_synchronize();
    *PHY_DATA = value;
}
