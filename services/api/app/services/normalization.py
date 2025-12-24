import re

_ws = re.compile(r"\s+")
_non_alnum = re.compile(r"[^a-zA-Z0-9]+")


def normalize_text(s: str) -> str:
    # Remove leading and trailing whitespace
    s = (s or "").strip().lower()
    s = _non_alnum.sub(" ", s)
    s = _ws.sub(" ", s).strip()
    return s


def normalize_isbn(s: str | None) -> str | None:
    if not s:
        return None
    digits = re.sub(r"[^0-9xX]", "", s)
    return digits.upper() if digits else None
