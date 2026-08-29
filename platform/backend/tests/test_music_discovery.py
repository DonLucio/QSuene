import pytest

from party_server.music_discovery import LastFmDiscoveryProvider, normalize_music_text


def test_music_normalization_handles_accents_and_punctuation():
    assert normalize_music_text("  Canción—Número 1! ") == "cancion numero 1"


@pytest.mark.asyncio
async def test_lastfm_combines_track_and_artist_results_without_duplicates(monkeypatch):
    provider = LastFmDiscoveryProvider("test-key")

    async def fake_call(method, **_params):
        if method == "track.search":
            return {"results": {"trackmatches": {"track": [
                {"name": "Tema Uno", "artist": "Top Boy", "url": "track", "listeners": "10"},
            ]}}}
        if method == "artist.search":
            return {"results": {"artistmatches": {"artist": [{"name": "Top Boy"}]}}}
        return {"toptracks": {"track": [
            {"name": "Tema Uno", "artist": {"name": "Top Boy"}, "url": "same", "listeners": "20"},
            {"name": "Tema Dos", "artist": {"name": "Top Boy"}, "url": "second", "listeners": "30"},
        ]}}

    monkeypatch.setattr(provider, "_call", fake_call)
    results = await provider.search("Top Boy", 20)

    assert [(item["title"], item["artist"]) for item in results] == [
        ("Tema Dos", "Top Boy"), ("Tema Uno", "Top Boy"),
    ]
