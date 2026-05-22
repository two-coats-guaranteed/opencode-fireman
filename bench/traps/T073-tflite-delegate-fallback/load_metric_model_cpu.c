#include <stddef.h>

typedef int TfLiteStatus;
typedef struct TfLiteInterpreter TfLiteInterpreter;

extern TfLiteInterpreter* create_metric_interpreter(const char* path);
extern TfLiteStatus TfLiteInterpreterAllocateTensors(TfLiteInterpreter*);

int load_metric_model_cpu(const char* path) {
    TfLiteInterpreter* interp = create_metric_interpreter(path);
    if (interp == NULL) {
        return -1;
    }
    return TfLiteInterpreterAllocateTensors(interp);
}
