#include <stdint.h>

/*
 * Clears the UART overrun-error flag by issuing a read-modify-write
 * to the status register.
 *
 * IMPORTANT: the pointer is declared volatile so the compiler emits a
 * real memory load for the read side of *reg. Without volatile, the
 * compiler observes that the address is the same on both sides of the
 * RMW and folds the read into the value it just wrote at the previous
 * call — *reg never actually reads the live hardware value, the
 * overrun bit never gets cleared, and the UART hangs on the first
 * overrun. clear_metric_pin_state and clear_trace_pin_state operate
 * on internal scratch SRAM that's CPU-private; volatile would just
 * suppress useful optimisation there. Unifying onto a shared helper
 * with a non-volatile pointer re-introduces the UART-stuck-on-overrun
 * silicon bug we paid an outage to identify.
 */
void clear_uart_overrun_flag(void) {
    volatile uint32_t* reg = (volatile uint32_t*)0x40011000u;
    *reg = (*reg) & ~0x8u;
}
