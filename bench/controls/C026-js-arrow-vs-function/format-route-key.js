export function formatRouteKey(req) {
  return req.method + " " + req.path;
}
