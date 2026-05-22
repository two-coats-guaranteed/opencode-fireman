def read_cache_blob(path: str) -> str:
    f = open(path, "r")
    return f.read()
