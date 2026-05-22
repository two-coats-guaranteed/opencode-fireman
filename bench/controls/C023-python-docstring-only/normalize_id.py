def normalize_id(raw: str) -> str:
    """
    Cleans a numeric identifier by removing every non-digit character.

    Notes:
        - Leading zeros are preserved.
        - Empty strings return empty strings.
        - Unicode digits (e.g. Arabic-Indic) are NOT included because
          isdigit() in Python 3 only returns True for the ASCII digits
          0–9 plus a small set of decimal digits — see PEP 3138.
    """
    return "".join(c for c in raw if c.isdigit())
