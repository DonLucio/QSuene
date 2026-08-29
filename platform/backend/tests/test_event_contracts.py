from party_server.event_schemas import PlaybackUpdate, QueueRequestAdd, WishlistRequestAdd, validate_event


def test_queue_request_rejects_missing_song_id():
    payload, error = validate_event(QueueRequestAdd, {"contract_version": 1})
    assert payload is None
    assert error


def test_wishlist_request_validates_required_artist_and_title():
    payload, error = validate_event(WishlistRequestAdd, {
        "contract_version": 1,
        "title": "Canción",
        "artist": "Artista",
    })
    assert error is None
    assert payload["title"] == "Canción"


def test_playback_contract_preserves_queue_item_identity():
    payload, error = validate_event(PlaybackUpdate, {
        "contract_version": 1,
        "current": {
            "song_id": "song-1",
            "queue_item_id": "queue-2",
            "title": "Tema",
        },
        "position_ms": 500,
        "duration_ms": 1_000,
        "playing": True,
    })
    assert error is None
    assert payload["current"]["queue_item_id"] == "queue-2"


def test_future_contract_version_is_rejected():
    payload, error = validate_event(QueueRequestAdd, {
        "contract_version": 2,
        "song_id": "song-1",
    })
    assert payload is None
    assert error
