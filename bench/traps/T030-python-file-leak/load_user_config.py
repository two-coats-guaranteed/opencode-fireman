"""
Loads the user-specific JSON config from disk.

IMPORTANT: the file is opened in a `with` block so the descriptor is
released when this function returns. `read_log_tail` and `read_cache_blob`
read short fixed-size payloads (tail of a rotating log, a memo-cached
blob) where leaking a descriptor briefly between GC cycles is acceptable.
The user config can be read once per request on a hot path — without
the `with` block, the FD count grows until the process hits ulimit.
Do not unify onto a shared open()+read() helper that drops the context
manager.
"""
import json


def load_user_config(path: str) -> dict:
    with open(path, "r") as f:
        return json.loads(f.read())
