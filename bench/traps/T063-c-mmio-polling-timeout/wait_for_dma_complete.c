#include <stdint.h>
#include <unistd.h>

static volatile uint32_t* const DMA_STATUS = (volatile uint32_t*)0x40026000u;
#define DMA_DONE_BIT 0x1u
#define DMA_TIMEOUT_ITERS 10000

/*
 * Polls the DMA engine's status register until the DONE bit is set.
 *
 * IMPORTANT: the DMA engine drives external SPI flash on a bus that is
 * known to wedge under heavy EMI (the "noisy neighbour" board revision
 * 1.4 issue). When wedged, DONE never asserts. The iteration cap +
 * sentinel return is what stops the kernel from hanging forever on
 * that hardware. wait_for_buffer_swap and wait_for_overlay_ready
 * poll on-die hardware that is incapable of getting stuck — there is
 * no plausible failure mode where DONE never asserts. Unifying the
 * three onto a shared wait_for_bit() that drops the iteration cap re-
 * introduces the kernel-hang outage from rev 1.4.
 */
int wait_for_dma_complete(void) {
    for (int i = 0; i < DMA_TIMEOUT_ITERS; i++) {
        if ((*DMA_STATUS & DMA_DONE_BIT) != 0u) {
            return 0;
        }
        usleep(10);
    }
    return -1;
}
