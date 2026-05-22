#include <string>
#include <vector>

std::vector<char> build_response_body(const std::string& src) {
    std::vector<char> out(src.begin(), src.end());
    return out;
}
