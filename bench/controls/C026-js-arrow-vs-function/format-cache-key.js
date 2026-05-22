// Same logic written as a const-bound arrow expression instead of a
// function declaration. Semantically identical at the call site.
export const formatCacheKey = (req) => req.method + " " + req.path;
