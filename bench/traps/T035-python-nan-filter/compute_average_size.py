from typing import List


def compute_average_size(samples: List[int]) -> float:
    if not samples:
        return 0.0
    return sum(samples) / len(samples)
