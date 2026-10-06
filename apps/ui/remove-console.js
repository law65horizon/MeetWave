module.exports = function (file, api) {
  const j = api.jscodeshift;
  return j(file.source)
    .find(j.ExpressionStatement, {
      expression: {
        type: "CallExpression",
        callee: {
          type: "MemberExpression",
          object: { name: "console" },
        },
      },
    })
    .filter((p) =>
      ["log", "debug"].includes(p.node.expression.callee.property.name),
    )
    .remove()
    .toSource();
};
