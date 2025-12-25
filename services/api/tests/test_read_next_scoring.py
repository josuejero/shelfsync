from app.services.read_next_scoring import compute_read_next


def test_available_beats_hold_beats_not_owned():
    preferred = ["ebook", "audiobook"]

    available = [
        {
            "format": "ebook",
            "status": "available",
            "copies_available": 1,
            "copies_total": 1,
            "holds": 0,
        }
    ]
    hold = [
        {
            "format": "ebook",
            "status": "hold",
            "copies_available": 0,
            "copies_total": 2,
            "holds": 10,
        }
    ]
    not_owned = [
        {
            "format": "ebook",
            "status": "not_owned",
            "copies_available": 0,
            "copies_total": 0,
            "holds": 0,
        }
    ]

    s1 = compute_read_next(available, preferred)
    s2 = compute_read_next(hold, preferred)
    s3 = compute_read_next(not_owned, preferred)

    assert s1.tier == "available"
    assert s2.tier == "hold"
    assert s3.tier == "not_owned"


def test_preferred_format_wins_when_same_status():
    preferred = ["ebook", "audiobook"]

    ebook_avail = [{"format": "ebook", "status": "available", "copies_available": 1}]
    audio_avail = [
        {"format": "audiobook", "status": "available", "copies_available": 1}
    ]

    s_ebook = compute_read_next(ebook_avail, preferred)
    s_audio = compute_read_next(audio_avail, preferred)

    assert s_ebook.score > s_audio.score


def test_graceful_on_missing_fields():
    preferred = ["ebook"]
    # Missing copies/holds fields should not throw.
    weird = [{"format": "ebook", "status": "hold"}]
    s = compute_read_next(weird, preferred)
    assert s.tier == "hold"
    assert isinstance(s.reasons, list)
