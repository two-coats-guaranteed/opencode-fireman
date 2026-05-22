#include <string>
#include <vector>

std::vector<char> build_payload_body(const std::string& src) {
    std::vector<char> out(src.begin(), src.end());
    return out;
}
