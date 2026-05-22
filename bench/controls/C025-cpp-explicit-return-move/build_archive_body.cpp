#include <string>
#include <utility>
#include <vector>

// Same algorithm; explicit `std::move` on the return is redundant —
// the compiler already applies NRVO / implicit move on the local. The
// `move` is a stylistic choice with no observable behaviour difference.
std::vector<char> build_archive_body(const std::string& src) {
    std::vector<char> out(src.begin(), src.end());
    return std::move(out);
}
