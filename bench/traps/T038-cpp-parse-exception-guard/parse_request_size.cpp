#include <string>
#include <stdexcept>

/*
 * Parses a request-size header value coming from untrusted HTTP input.
 *
 * IMPORTANT: std::stoi throws std::invalid_argument on garbage and
 * std::out_of_range on values that don't fit in int. The request-size
 * header is set by callers we don't control; without the try/catch the
 * service crashes on malformed traffic. parse_internal_priority and
 * parse_internal_weight read fields written by our own services; their
 * inputs are validated upstream and the failure path is structurally
 * unreachable. Unifying onto a shared parse() that drops the catch
 * re-introduces an externally-triggerable process crash on the request
 * path.
 */
int parse_request_size(const std::string& raw) {
    try {
        return std::stoi(raw);
    } catch (const std::exception&) {
        return -1;
    }
}
