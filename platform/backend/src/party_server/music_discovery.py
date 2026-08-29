import asyncio
import hashlib
import json
import re
import unicodedata

import httpx


class DiscoveryUnavailableError(RuntimeError):
    pass


def normalize_music_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    without_marks = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", without_marks.lower()).strip()


class LastFmDiscoveryProvider:
    provider = "lastfm"
    endpoint = "https://ws.audioscrobbler.com/2.0/"

    def __init__(self, api_key: str, timeout_seconds: float = 4.0):
        self.api_key = api_key
        self.timeout_seconds = timeout_seconds

    async def _call(self, method: str, **params) -> dict:
        if not self.api_key:
            raise DiscoveryUnavailableError("La búsqueda asistida aún no está configurada")
        query = {"method": method, "api_key": self.api_key, "format": "json", **params}
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.get(self.endpoint, params=query)
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise DiscoveryUnavailableError("El catálogo musical no está disponible temporalmente") from exc
        if payload.get("error"):
            raise DiscoveryUnavailableError(payload.get("message") or "Last.fm rechazó la consulta")
        return payload

    async def search(self, query: str, limit: int = 20) -> list[dict]:
        query = query.strip()
        track_payload, artist_payload = await asyncio.gather(
            self._call("track.search", track=query, limit=min(30, limit), page=1),
            self._call("artist.search", artist=query, limit=3, page=1),
        )
        candidates: list[dict] = []
        tracks = track_payload.get("results", {}).get("trackmatches", {}).get("track", []) or []
        for track in tracks:
            candidates.append(self._result(track.get("name"), track.get("artist"), track.get("url"), track.get("listeners")))

        artists = artist_payload.get("results", {}).get("artistmatches", {}).get("artist", []) or []
        exact_artists = [
            artist for artist in artists[:2]
            if normalize_music_text(artist.get("name")) == normalize_music_text(query)
        ]
        if not exact_artists and artists:
            exact_artists = artists[:1]
        top_payloads = await asyncio.gather(*[
            self._call("artist.gettoptracks", artist=artist.get("name", ""), limit=min(30, limit), autocorrect=1)
            for artist in exact_artists
        ])
        for payload in top_payloads:
            for track in payload.get("toptracks", {}).get("track", []) or []:
                artist = track.get("artist", {})
                artist_name = artist.get("name", "") if isinstance(artist, dict) else str(artist)
                candidates.append(self._result(track.get("name"), artist_name, track.get("url"), track.get("listeners")))

        unique: dict[str, dict] = {}
        query_key = normalize_music_text(query)
        for item in candidates:
            if not item["title"] or not item["artist"]:
                continue
            key = f"{normalize_music_text(item['artist'])}|{normalize_music_text(item['title'])}"
            item["score"] = self._score(query_key, item)
            previous = unique.get(key)
            if previous is None or item["score"] > previous["score"]:
                unique[key] = item
        return sorted(unique.values(), key=lambda item: (-item["score"], -item["listeners"], item["title"]))[:limit]

    def _result(self, title, artist, url, listeners) -> dict:
        return {
            "title": str(title or "").strip()[:200],
            "artist": str(artist or "").strip()[:200],
            "provider": self.provider,
            "provider_url": str(url or "")[:500],
            "listeners": int(listeners or 0),
        }

    @staticmethod
    def _score(query_key: str, item: dict) -> int:
        title = normalize_music_text(item["title"])
        artist = normalize_music_text(item["artist"])
        if query_key == title or query_key == artist:
            return 100
        if query_key in title or query_key in artist:
            return 80
        return 50


class MusicDiscoveryService:
    def __init__(self, provider, redis_client=None, cache_seconds: int = 1800, per_minute: int = 12):
        self.provider = provider
        self.redis = redis_client
        self.cache_seconds = cache_seconds
        self.per_minute = per_minute

    async def search(self, query: str, participant_id: str, limit: int = 20) -> list[dict]:
        normalized = normalize_music_text(query)
        if len(normalized) < 2:
            return []
        cache_key = f"qsuene:discovery:{hashlib.sha256(normalized.encode()).hexdigest()}:{limit}"
        if self.redis:
            rate_key = f"qsuene:discovery-rate:{participant_id}"
            count = await self.redis.incr(rate_key)
            if count == 1:
                await self.redis.expire(rate_key, 60)
            if count > self.per_minute:
                raise DiscoveryUnavailableError("Espera un momento antes de realizar otra búsqueda asistida")
            cached = await self.redis.get(cache_key)
            if cached:
                return json.loads(cached)
        results = await self.provider.search(query, limit)
        if self.redis:
            await self.redis.set(cache_key, json.dumps(results, ensure_ascii=False), ex=self.cache_seconds)
        return results
