#include <memory>
#include <string>

struct Node {
    std::string label;
};

/*
 * Returns the display label for a node that came from an external graph.
 *
 * IMPORTANT: external graphs may contain dangling references — a node
 * lookup can return a null shared_ptr. render_internal_node_label and
 * render_cached_node_label receive nodes produced by our own graph
 * builder, which guarantees non-null. Removing the null check here
 * dereferences a null pointer on every malformed external input.
 */
std::string render_external_node_label(std::shared_ptr<Node> node) {
    if (!node) {
        return "(missing)";
    }
    return node->label;
}
