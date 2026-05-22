// Same fields read, accessed directly instead of via destructuring.
// Semantically identical for non-getter / non-proxy objects, which is
// what every caller passes here.
export function renderCardC(user) {
  return user.name + " (" + user.role + ")";
}
