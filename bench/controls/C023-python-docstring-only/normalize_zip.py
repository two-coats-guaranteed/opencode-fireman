def normalize_zip(raw: str) -> str:
    """Strips non-digit characters from a ZIP-code string."""
    return "".join(c for c in raw if c.isdigit())
