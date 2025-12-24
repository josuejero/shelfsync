import pytest
from app.services.goodreads_csv import CsvImportError, parse_goodreads_csv


def test_parse_goodreads_csv_minimal():
    csv_bytes = (
        "Title,Author,Book Id,ISBN,ISBN13,Exclusive Shelf\n"
        "Dune,Frank Herbert,42,0441013597,9780441013593,to-read\n"
    ).encode("utf-8")

    rows, errors = parse_goodreads_csv(csv_bytes)
    assert errors == []
    assert len(rows) == 1
    assert rows[0]["title"] == "Dune"
    assert rows[0]["author"] == "Frank Herbert"
    assert rows[0]["external_id"] == "42"


def test_parse_goodreads_csv_missing_columns():
    bad = "A,B\n1,2\n".encode("utf-8")
    with pytest.raises(CsvImportError):
        parse_goodreads_csv(bad)
