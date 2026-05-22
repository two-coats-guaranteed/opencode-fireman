export function formatAssetKey(req) {
  return req.method + " " + req.path;
}
