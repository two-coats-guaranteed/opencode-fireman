def read_log_tail(path: str) -> str:
    f = open(path, "r")
    return f.read()
