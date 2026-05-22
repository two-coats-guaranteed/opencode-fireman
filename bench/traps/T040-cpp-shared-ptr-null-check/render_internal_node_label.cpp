#include <memory>
#include <string>

struct Node {
    std::string label;
};

std::string render_internal_node_label(std::shared_ptr<Node> node) {
    return node->label;
}
