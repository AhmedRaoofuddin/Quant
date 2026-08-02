#include "alphaforge/dsl/Expression.hpp"

#include <cctype>
#include <cmath>
#include <set>
#include <unordered_map>

#include "alphaforge/platform/Error.hpp"

namespace alphaforge::dsl {

using detail::BinOp;
using detail::Node;
using detail::NodeKind;
using detail::NodePtr;
using math::Matrix;

namespace {

// ---------------------------------------------------------------- function table
struct Arity {
    int min;
    int max;
};

const std::unordered_map<std::string, Arity>& registry() {
    static const std::unordered_map<std::string, Arity> table = {
        {"rank", {1, 1}},        {"zscore", {1, 1}},   {"scale", {1, 2}},
        {"sign", {1, 1}},        {"abs", {1, 1}},      {"log", {1, 1}},
        {"delay", {2, 2}},       {"delta", {2, 2}},    {"ts_mean", {2, 2}},
        {"ts_std", {2, 2}},      {"ts_sum", {2, 2}},   {"ts_min", {2, 2}},
        {"ts_max", {2, 2}},      {"ts_rank", {2, 2}},  {"ts_argmax", {2, 2}},
        {"ts_argmin", {2, 2}},   {"decay_linear", {2, 2}},
        {"correlation", {3, 3}}, {"covariance", {3, 3}},
        {"power", {2, 2}},       {"signedpower", {2, 2}},
        {"min", {2, 2}},         {"max", {2, 2}},
    };
    return table;
}

// ---------------------------------------------------------------- lexer
enum class Tok { Number, Ident, Plus, Minus, Star, Slash, LParen, RParen, Comma, End };

struct Token {
    Tok kind = Tok::End;
    double number = 0.0;
    std::string text;

    Token() = default;
    Token(Tok k) : kind(k) {}  // implicit: enables `return {Tok::Plus};`
};

class Lexer {
public:
    explicit Lexer(const std::string& src) : s_(src) {}

    Token next() {
        while (pos_ < s_.size() && std::isspace(static_cast<unsigned char>(s_[pos_]))) ++pos_;
        if (pos_ >= s_.size()) return {Tok::End};

        const char c = s_[pos_];
        switch (c) {
            case '+': ++pos_; return {Tok::Plus};
            case '-': ++pos_; return {Tok::Minus};
            case '*': ++pos_; return {Tok::Star};
            case '/': ++pos_; return {Tok::Slash};
            case '(': ++pos_; return {Tok::LParen};
            case ')': ++pos_; return {Tok::RParen};
            case ',': ++pos_; return {Tok::Comma};
            default: break;
        }
        if (std::isdigit(static_cast<unsigned char>(c)) || c == '.') return number();
        if (std::isalpha(static_cast<unsigned char>(c)) || c == '_') return ident();
        throw DslError(std::string("Unexpected character '") + c + "' in expression");
    }

private:
    Token number() {
        const std::size_t start = pos_;
        while (pos_ < s_.size() &&
               (std::isdigit(static_cast<unsigned char>(s_[pos_])) || s_[pos_] == '.')) {
            ++pos_;
        }
        Token t{Tok::Number};
        t.number = std::stod(s_.substr(start, pos_ - start));
        return t;
    }
    Token ident() {
        const std::size_t start = pos_;
        while (pos_ < s_.size() &&
               (std::isalnum(static_cast<unsigned char>(s_[pos_])) || s_[pos_] == '_')) {
            ++pos_;
        }
        Token t{Tok::Ident};
        t.text = s_.substr(start, pos_ - start);
        return t;
    }

    const std::string& s_;
    std::size_t pos_ = 0;
};

// ---------------------------------------------------------------- parser
class Parser {
public:
    explicit Parser(const std::string& src) : lexer_(src) { advance(); }

    NodePtr parse() {
        NodePtr node = expr();
        expect(Tok::End, "trailing tokens after expression");
        return node;
    }

private:
    void advance() { cur_ = lexer_.next(); }
    void expect(Tok kind, const std::string& what) {
        if (cur_.kind != kind) throw DslError("Expected " + what);
        advance();
    }

    NodePtr expr() {
        NodePtr node = term();
        while (cur_.kind == Tok::Plus || cur_.kind == Tok::Minus) {
            const BinOp op = cur_.kind == Tok::Plus ? BinOp::Add : BinOp::Sub;
            advance();
            node = Node::make_binary(op, node, term());
        }
        return node;
    }

    NodePtr term() {
        NodePtr node = factor();
        while (cur_.kind == Tok::Star || cur_.kind == Tok::Slash) {
            const BinOp op = cur_.kind == Tok::Star ? BinOp::Mul : BinOp::Div;
            advance();
            node = Node::make_binary(op, node, factor());
        }
        return node;
    }

    NodePtr factor() {
        if (cur_.kind == Tok::Minus) {
            advance();
            return Node::make_unary(/*negate=*/true, factor());
        }
        if (cur_.kind == Tok::Plus) {
            advance();
            return factor();
        }
        return primary();
    }

    NodePtr primary() {
        if (cur_.kind == Tok::Number) {
            const double v = cur_.number;
            advance();
            return Node::make_number(v);
        }
        if (cur_.kind == Tok::LParen) {
            advance();
            NodePtr node = expr();
            expect(Tok::RParen, "')'");
            return node;
        }
        if (cur_.kind == Tok::Ident) {
            const std::string name = cur_.text;
            advance();
            if (cur_.kind == Tok::LParen) return call(name);
            return Node::make_field(name);
        }
        throw DslError("Expected a number, field, or '('");
    }

    NodePtr call(const std::string& name) {
        expect(Tok::LParen, "'('");
        std::vector<NodePtr> args;
        if (cur_.kind != Tok::RParen) {
            args.push_back(expr());
            while (cur_.kind == Tok::Comma) {
                advance();
                args.push_back(expr());
            }
        }
        expect(Tok::RParen, "')'");
        return Node::make_call(name, std::move(args));
    }

    Lexer lexer_;
    Token cur_;
};

// ---------------------------------------------------------------- validation
void validate_node(const NodePtr& n, const std::set<std::string>& fields) {
    switch (n->kind) {
        case NodeKind::Number:
            return;
        case NodeKind::Field:
            if (fields.find(n->field) == fields.end()) {
                throw DslError("Unknown field '" + n->field + "'");
            }
            return;
        case NodeKind::Unary:
            validate_node(n->children[0], fields);
            return;
        case NodeKind::Binary:
            validate_node(n->children[0], fields);
            validate_node(n->children[1], fields);
            return;
        case NodeKind::Call: {
            auto it = registry().find(n->callee);
            if (it == registry().end()) throw DslError("Unknown function '" + n->callee + "'");
            const int argc = static_cast<int>(n->children.size());
            if (argc < it->second.min || argc > it->second.max) {
                throw DslError("Function '" + n->callee + "' called with wrong argument count");
            }
            for (const auto& c : n->children) validate_node(c, fields);
            return;
        }
    }
}

// ---------------------------------------------------------------- evaluation
/// A DSL value is either a scalar or a full matrix.
struct Value {
    bool scalar;
    double s = 0.0;
    Matrix m;
};

Value make_scalar(double v) { return {true, v, {}}; }
Value make_matrix(Matrix mat) { return {false, 0.0, std::move(mat)}; }

Matrix const_like(const Matrix& ref, double v) {
    Matrix out(ref.row_labels(), ref.col_labels());
    for (std::size_t i = 0; i < ref.rows(); ++i)
        for (std::size_t j = 0; j < ref.cols(); ++j) out.at(i, j) = v;
    return out;
}

Matrix as_matrix(const Value& v, const Matrix& shape_ref) {
    return v.scalar ? const_like(shape_ref, v.s) : v.m;
}

double require_scalar(const Value& v, const std::string& fn) {
    if (!v.scalar) throw DslError("Function '" + fn + "' expects a numeric constant argument");
    return v.s;
}

const Matrix& require_matrix(const Value& v, const std::string& fn) {
    if (v.scalar) throw DslError("Function '" + fn + "' expects a field/matrix argument");
    return v.m;
}

Value combine(BinOp op, const Value& a, const Value& b) {
    if (a.scalar && b.scalar) {
        switch (op) {
            case BinOp::Add: return make_scalar(a.s + b.s);
            case BinOp::Sub: return make_scalar(a.s - b.s);
            case BinOp::Mul: return make_scalar(a.s * b.s);
            case BinOp::Div: return make_scalar(a.s / b.s);
        }
    }
    const Matrix& ref = a.scalar ? b.m : a.m;
    const Matrix left = as_matrix(a, ref);
    const Matrix right = as_matrix(b, ref);
    switch (op) {
        case BinOp::Add: return make_matrix(left + right);
        case BinOp::Sub: return make_matrix(left - right);
        case BinOp::Mul: return make_matrix(left * right);
        case BinOp::Div: return make_matrix((left / right).sanitized());
    }
    throw InternalError("unreachable BinOp");
}

class Evaluator {
public:
    explicit Evaluator(const std::map<std::string, Matrix>& fields) : fields_(fields) {}

    Value eval(const NodePtr& n) {
        switch (n->kind) {
            case NodeKind::Number:
                return make_scalar(n->number);
            case NodeKind::Field: {
                auto it = fields_.find(n->field);
                if (it == fields_.end()) throw DslError("Unknown field '" + n->field + "'");
                return make_matrix(it->second);
            }
            case NodeKind::Unary: {
                Value v = eval(n->children[0]);
                if (!n->negate) return v;
                return v.scalar ? make_scalar(-v.s) : make_matrix(v.m.negate());
            }
            case NodeKind::Binary:
                return combine(n->op, eval(n->children[0]), eval(n->children[1]));
            case NodeKind::Call:
                return call(n);
        }
        throw InternalError("unreachable NodeKind");
    }

private:
    Value call(const NodePtr& n) {
        const std::string& fn = n->callee;
        std::vector<Value> args;
        args.reserve(n->children.size());
        for (const auto& c : n->children) args.push_back(eval(c));

        // Unary matrix transforms.
        if (fn == "rank") return make_matrix(require_matrix(args[0], fn).cs_rank());
        if (fn == "zscore") return make_matrix(require_matrix(args[0], fn).cs_zscore());
        if (fn == "sign") return make_matrix(require_matrix(args[0], fn).apply_sign());
        if (fn == "abs") return make_matrix(require_matrix(args[0], fn).apply_abs());
        if (fn == "log") return make_matrix(require_matrix(args[0], fn).apply_log());
        if (fn == "scale") {
            const double target = args.size() == 2 ? require_scalar(args[1], fn) : 1.0;
            return make_matrix(require_matrix(args[0], fn).cs_scale(target));
        }

        // Matrix + integer-window transforms.
        if (fn == "delay") return make_matrix(require_matrix(args[0], fn).ts_shift(window(args[1], fn)));
        if (fn == "delta") return make_matrix(require_matrix(args[0], fn).ts_delta(window(args[1], fn)));
        if (fn == "ts_mean") return make_matrix(require_matrix(args[0], fn).ts_mean(window(args[1], fn)));
        if (fn == "ts_std") return make_matrix(require_matrix(args[0], fn).ts_std(window(args[1], fn)));
        if (fn == "ts_sum") return make_matrix(require_matrix(args[0], fn).ts_sum(window(args[1], fn)));
        if (fn == "ts_min") return make_matrix(require_matrix(args[0], fn).ts_min(window(args[1], fn)));
        if (fn == "ts_max") return make_matrix(require_matrix(args[0], fn).ts_max(window(args[1], fn)));
        if (fn == "ts_rank") return make_matrix(require_matrix(args[0], fn).ts_rank(window(args[1], fn)));
        if (fn == "ts_argmax") return make_matrix(require_matrix(args[0], fn).ts_argmax(window(args[1], fn)));
        if (fn == "ts_argmin") return make_matrix(require_matrix(args[0], fn).ts_argmin(window(args[1], fn)));
        if (fn == "decay_linear")
            return make_matrix(require_matrix(args[0], fn).ts_decay_linear(window(args[1], fn)));

        // Matrix + exponent.
        if (fn == "power") return make_matrix(require_matrix(args[0], fn).apply_pow(require_scalar(args[1], fn)));
        if (fn == "signedpower")
            return make_matrix(require_matrix(args[0], fn).apply_signed_pow(require_scalar(args[1], fn)));

        // Pairwise rolling.
        if (fn == "correlation")
            return make_matrix(Matrix::ts_correlation(require_matrix(args[0], fn),
                                                      require_matrix(args[1], fn),
                                                      window(args[2], fn)));
        if (fn == "covariance")
            return make_matrix(Matrix::ts_covariance(require_matrix(args[0], fn),
                                                     require_matrix(args[1], fn),
                                                     window(args[2], fn)));

        // min/max: matrix-matrix, or matrix clipped by a scalar bound.
        if (fn == "min" || fn == "max") return min_max(fn, args);

        throw DslError("Unknown function '" + fn + "'");
    }

    static int window(const Value& v, const std::string& fn) {
        const double d = require_scalar(v, fn);
        const int w = static_cast<int>(std::lround(d));
        if (w <= 0) throw DslError("Function '" + fn + "' window must be a positive integer");
        return w;
    }

    Value min_max(const std::string& fn, const std::vector<Value>& args) {
        const bool is_min = fn == "min";
        if (!args[0].scalar && !args[1].scalar) {
            return make_matrix(is_min ? Matrix::element_min(args[0].m, args[1].m)
                                      : Matrix::element_max(args[0].m, args[1].m));
        }
        if (args[0].scalar && args[1].scalar) {
            return make_scalar(is_min ? std::min(args[0].s, args[1].s) : std::max(args[0].s, args[1].s));
        }
        const Matrix& mat = args[0].scalar ? args[1].m : args[0].m;
        const double bound = args[0].scalar ? args[0].s : args[1].s;
        return make_matrix(is_min ? mat.clip_upper(bound) : mat.clip_lower(bound));
    }

    const std::map<std::string, Matrix>& fields_;
};

}  // namespace

const std::vector<std::string>& function_names() {
    static const std::vector<std::string> names = [] {
        std::vector<std::string> out;
        for (const auto& [k, v] : registry()) out.push_back(k);
        (void) 0;
        return out;
    }();
    return names;
}

void validate(const std::string& source, const std::vector<std::string>& allowed_fields) {
    if (source.empty()) throw DslError("Empty expression");
    Parser parser(source);
    NodePtr root = parser.parse();
    const std::set<std::string> fields(allowed_fields.begin(), allowed_fields.end());
    validate_node(root, fields);
}

Expression Expression::parse(const std::string& source,
                             const std::vector<std::string>& allowed_fields) {
    if (source.empty()) throw DslError("Empty expression");
    Parser parser(source);
    NodePtr root = parser.parse();
    const std::set<std::string> fields(allowed_fields.begin(), allowed_fields.end());
    validate_node(root, fields);
    return Expression(std::move(root), source);
}

Matrix Expression::evaluate(const std::map<std::string, Matrix>& fields) const {
    Evaluator ev(fields);
    Value result = ev.eval(root_);
    if (result.scalar) {
        throw DslError("Expression reduces to a scalar; it must reference at least one field");
    }
    return result.m.sanitized();
}

}  // namespace alphaforge::dsl
