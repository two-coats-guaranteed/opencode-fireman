// Same output, written with `+` concatenation rather than a template
// literal. Result string is byte-identical.
export function buildErrorLabelC(code, source) {
  return "error[" + code + "] from " + source;
}
