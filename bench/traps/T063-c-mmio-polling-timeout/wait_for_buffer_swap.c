#include <stdint.h>
#include <unistd.h>

static volatile uint32_t* const FB_STATUS = (volatile uint32_t*)0x40070000u;
#define FB_SWAPPED_BIT 0x1u

int wait_for_buffer_swap(void) {
    while ((*FB_STATUS & FB_SWAPPED_BIT) == 0u) {
        usleep(10);
    }
    return 0;
}
