#include <stdio.h>

int write_debug_marker(FILE *stream, const char *record) {
    if (fputs(record, stream) == EOF) return -1;
    return 0;
}
