def normalize_phone(raw: str) -> str:
    """Strips non-digit characters from a phone-number string."""
    return "".join(c for c in raw if c.isdigit())
