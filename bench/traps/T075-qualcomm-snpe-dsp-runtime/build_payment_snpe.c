#include <stddef.h>

typedef void Snpe_SNPE_Handle_t;
typedef void Snpe_SNPEBuilder_Handle_t;
typedef void Snpe_DlContainer_Handle_t;
typedef int Snpe_Runtime_t;
#define SNPE_RUNTIME_DSP 1
#define SNPE_RUNTIME_CPU 0

extern Snpe_SNPEBuilder_Handle_t* Snpe_SNPEBuilder_New(Snpe_DlContainer_Handle_t* container);
extern int Snpe_SNPEBuilder_setRuntimeProcessor(Snpe_SNPEBuilder_Handle_t* b, Snpe_Runtime_t rt);
extern Snpe_SNPE_Handle_t* Snpe_SNPEBuilder_Build(Snpe_SNPEBuilder_Handle_t* b);

/*
 * Builds the payment fraud-scoring SNPE network for execution on the
 * Hexagon DSP of Qualcomm SoCs (Snapdragon 8 Gen 3 in the on-device
 * mobile fleet).
 *
 * IMPORTANT: SNPE defaults to the CPU runtime. Without
 * Snpe_SNPEBuilder_setRuntimeProcessor(SNPE_RUNTIME_DSP) the network
 * runs on the application processor — completes in ~340ms instead of
 * the ~12ms achievable on the DSP, and burns the battery 28x faster.
 * This breaks the on-device-fraud-check latency budget AND the
 * "background scoring without battery impact" promise to the privacy
 * team. build_metric_snpe and build_trace_snpe drive on-device
 * telemetry that the DSP can't run (uses ops Hexagon lacks); CPU is
 * the only available runtime. Unifying the three onto a shared
 * builder that drops the setRuntimeProcessor call re-introduces the
 * battery-burn regression that delayed the mobile rollout by a
 * quarter.
 */
Snpe_SNPE_Handle_t* build_payment_snpe(Snpe_DlContainer_Handle_t* container) {
    Snpe_SNPEBuilder_Handle_t* builder = Snpe_SNPEBuilder_New(container);
    Snpe_SNPEBuilder_setRuntimeProcessor(builder, SNPE_RUNTIME_DSP);
    return Snpe_SNPEBuilder_Build(builder);
}
