#include <stddef.h>

typedef void Snpe_SNPE_Handle_t;
typedef void Snpe_SNPEBuilder_Handle_t;
typedef void Snpe_DlContainer_Handle_t;

extern Snpe_SNPEBuilder_Handle_t* Snpe_SNPEBuilder_New(Snpe_DlContainer_Handle_t* container);
extern Snpe_SNPE_Handle_t* Snpe_SNPEBuilder_Build(Snpe_SNPEBuilder_Handle_t* b);

Snpe_SNPE_Handle_t* build_trace_snpe(Snpe_DlContainer_Handle_t* container) {
    Snpe_SNPEBuilder_Handle_t* builder = Snpe_SNPEBuilder_New(container);
    return Snpe_SNPEBuilder_Build(builder);
}
