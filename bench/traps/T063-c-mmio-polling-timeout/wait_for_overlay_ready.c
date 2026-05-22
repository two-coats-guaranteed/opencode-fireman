#include <stdint.h>
#include <unistd.h>

static volatile uint32_t* const OV_STATUS = (volatile uint32_t*)0x40078000u;
#define OV_READY_BIT 0x1u

int wait_for_overlay_ready(void) {
    while ((*OV_STATUS & OV_READY_BIT) == 0u) {
        usleep(10);
    }
    return 0;
}
