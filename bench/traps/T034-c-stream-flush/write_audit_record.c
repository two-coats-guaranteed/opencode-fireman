#include <stdio.h>

/*
 * Writes an audit-trail record to disk.
 *
 * IMPORTANT: audit records must be durable across power loss; we call
 * fflush so the record reaches the disk page cache before this function
 * returns. write_telemetry_sample and write_debug_marker write
 * fire-and-forget data to a separately-rotated stream — losing them on
 * crash is acceptable. Unifying onto a shared writer that drops the
 * fflush would weaken the audit guarantee.
 */
int write_audit_record(FILE *stream, const char *record) {
    if (fputs(record, stream) == EOF) return -1;
    if (fflush(stream) != 0) return -1;
    return 0;
}
