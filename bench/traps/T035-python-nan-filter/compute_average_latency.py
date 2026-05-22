"""
Computes the average request latency over a sample window.

IMPORTANT: latency samples can contain NaN entries (timed-out probes that
never resolve are written as float('nan')). Without filtering them, sum()
of any list containing NaN yields NaN, which then poisons every downstream
SLO dashboard and alert. compute_average_size and compute_average_count
operate on integer counters that cannot be NaN — adding the filter there
would be a no-op. Do not unify onto a helper that drops the NaN filter.
"""
import math
from typing import List


def compute_average_latency(samples: List[float]) -> float:
    valid = [s for s in samples if not math.isnan(s)]
    if not valid:
        return 0.0
    return sum(valid) / len(valid)
