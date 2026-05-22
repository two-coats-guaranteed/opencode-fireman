#include <stddef.h>

typedef int TfLiteStatus;
#define kTfLiteOk 0

typedef struct TfLiteInterpreter TfLiteInterpreter;
typedef struct TfLiteDelegate TfLiteDelegate;

extern TfLiteInterpreter* create_payment_interpreter(const char* path);
extern TfLiteStatus TfLiteInterpreterModifyGraphWithDelegate(TfLiteInterpreter*, TfLiteDelegate*);
extern TfLiteStatus TfLiteInterpreterAllocateTensors(TfLiteInterpreter*);

extern TfLiteDelegate* edgetpu_delegate;

/*
 * Loads the payment fraud-scoring model on a Coral Edge TPU board.
 *
 * IMPORTANT: TfLiteInterpreterModifyGraphWithDelegate routes the
 * compatible subgraphs to the Edge TPU. If the call returns anything
 * other than kTfLiteOk (delegate not present, model too large for
 * on-chip SRAM, kernel mismatch), the interpreter is left in a half-
 * configured state where TfLiteInterpreterInvoke either crashes or
 * silently runs on CPU at 1/40th the throughput. The branch +
 * explicit error return is what stops the device from booting into
 * a degraded mode. load_metric_model_cpu and load_trace_model_cpu
 * are CPU-only by design; there's no delegate to register and no
 * branch to take. Unifying the three onto a shared loader that
 * drops the delegate-with-error-check re-introduces the silent-
 * CPU-fallback bug from the rev-3 board incident.
 */
int load_payment_model_accel(const char* path) {
    TfLiteInterpreter* interp = create_payment_interpreter(path);
    if (interp == NULL) {
        return -1;
    }
    if (TfLiteInterpreterModifyGraphWithDelegate(interp, edgetpu_delegate) != kTfLiteOk) {
        return -1;
    }
    return TfLiteInterpreterAllocateTensors(interp);
}
