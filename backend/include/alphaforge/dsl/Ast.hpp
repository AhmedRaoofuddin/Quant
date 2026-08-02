#pragma once
///
/// \file Ast.hpp
/// \brief Abstract syntax tree for the Alpha DSL (internal representation).
///
/// Nodes are immutable once built. Kept in a `detail` namespace because callers interact only
/// with the compiled dsl::Expression, never the tree directly.
///
#include <memory>
#include <string>
#include <vector>

namespace alphaforge::dsl::detail {

enum class NodeKind { Number, Field, Unary, Binary, Call };
enum class BinOp { Add, Sub, Mul, Div };

struct Node {
    NodeKind kind;

    // Number
    double number = 0.0;

    // Field
    std::string field;

    // Unary (only negation is supported): operand in children[0], `negate` marks '-'.
    bool negate = false;

    // Binary
    BinOp op = BinOp::Add;

    // Call
    std::string callee;

    std::vector<std::shared_ptr<const Node>> children;

    static std::shared_ptr<const Node> make_number(double v) {
        auto n = std::make_shared<Node>();
        n->kind = NodeKind::Number;
        n->number = v;
        return n;
    }
    static std::shared_ptr<const Node> make_field(std::string name) {
        auto n = std::make_shared<Node>();
        n->kind = NodeKind::Field;
        n->field = std::move(name);
        return n;
    }
    static std::shared_ptr<const Node> make_unary(bool negate, std::shared_ptr<const Node> child) {
        auto n = std::make_shared<Node>();
        n->kind = NodeKind::Unary;
        n->negate = negate;
        n->children.push_back(std::move(child));
        return n;
    }
    static std::shared_ptr<const Node> make_binary(BinOp op, std::shared_ptr<const Node> l,
                                                   std::shared_ptr<const Node> r) {
        auto n = std::make_shared<Node>();
        n->kind = NodeKind::Binary;
        n->op = op;
        n->children.push_back(std::move(l));
        n->children.push_back(std::move(r));
        return n;
    }
    static std::shared_ptr<const Node> make_call(std::string callee,
                                                 std::vector<std::shared_ptr<const Node>> args) {
        auto n = std::make_shared<Node>();
        n->kind = NodeKind::Call;
        n->callee = std::move(callee);
        n->children = std::move(args);
        return n;
    }
};

using NodePtr = std::shared_ptr<const Node>;

}  // namespace alphaforge::dsl::detail
