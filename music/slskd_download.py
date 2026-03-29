#!/usr/bin/env python3
"""
Skrypt do pobierania utworów z Soulseeka via slskd REST API.
Czyta listę artystów/tytułów z pliku tekstowego i kolejkuje pobieranie.

Wymagania:
  - slskd uruchomiony lokalnie (brew install slskd / docker)
  - Python 3.8+
  - pip install requests

Użycie:
  python3 slskd_download.py playlist_songs_i_want_to_send_her.txt

Konfiguracja:
  Ustaw zmienne środowiskowe lub edytuj stałe poniżej:
    SLSKD_URL      - adres slskd (domyślnie http://localhost:5030)
    SLSKD_API_KEY  - klucz API z konfiguracji slskd
"""

import argparse
import os
import re
import sys
import time
from typing import Optional

try:
    import requests
except ImportError:
    print("Brak biblioteki requests. Zainstaluj: pip3 install requests")
    sys.exit(1)


# ── Konfiguracja ──────────────────────────────────────────────────────────────

SLSKD_URL = os.environ.get("SLSKD_URL", "http://localhost:5030")
SLSKD_API_KEY = os.environ.get("SLSKD_API_KEY", "")

# Preferencje jakości — priorytet od najlepszego
PREFERRED_FORMATS = [".mp3"]
MIN_BITRATE = 300  # szukamy 320kbps, akceptujemy >= 300
FALLBACK_BITRATE = 192  # absolutne minimum

SEARCH_TIMEOUT = 30  # sekundy na oczekiwanie wyników wyszukiwania
DELAY_BETWEEN_SEARCHES = 3  # sekundy przerwy między wyszukiwaniami


# ── API helpers ───────────────────────────────────────────────────────────────

session = requests.Session()


def api_headers():
    headers = {"Content-Type": "application/json"}
    if SLSKD_API_KEY:
        headers["X-API-Key"] = SLSKD_API_KEY
    return headers


def api_get(path: str, **kwargs):
    url = f"{SLSKD_URL}/api/v0/{path.lstrip('/')}"
    r = session.get(url, headers=api_headers(), **kwargs)
    r.raise_for_status()
    return r.json()


def api_post(path: str, json_data=None, **kwargs):
    url = f"{SLSKD_URL}/api/v0/{path.lstrip('/')}"
    r = session.post(url, headers=api_headers(), json=json_data, **kwargs)
    r.raise_for_status()
    return r


def api_delete(path: str, **kwargs):
    url = f"{SLSKD_URL}/api/v0/{path.lstrip('/')}"
    r = session.delete(url, headers=api_headers(), **kwargs)
    r.raise_for_status()
    return r


# ── Parsowanie playlisty ─────────────────────────────────────────────────────

def parse_playlist(filepath: str) -> list[dict]:
    """
    Parsuje plik z listą w formacie:
      1. Artysta — Tytuł
      2. Artysta, Artysta2 — Tytuł
    Zwraca listę słowników {artist, title, query}.
    """
    tracks = []
    pattern = re.compile(r"^\d+\.\s+(.+?)\s*[—–-]\s+(.+)$")

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            match = pattern.match(line)
            if match:
                artist_raw = match.group(1).strip()
                title = match.group(2).strip()
                # Weź pierwszego artystę (przed przecinkiem) do wyszukiwania
                primary_artist = artist_raw.split(",")[0].strip()
                query = f"{primary_artist} {title}"
                tracks.append({
                    "artist": artist_raw,
                    "primary_artist": primary_artist,
                    "title": title,
                    "query": query,
                })

    return tracks


# ── Wyszukiwanie i selekcja ──────────────────────────────────────────────────

def search_and_wait(query: str) -> dict:
    """Rozpoczyna wyszukiwanie i czeka na wyniki."""
    # Rozpocznij wyszukiwanie
    resp = api_post("searches", json_data={"searchText": query})
    search_data = resp.json()
    search_id = search_data["id"]

    print(f"  🔍 Szukam: {query} (id: {search_id})")

    # Czekaj na wyniki
    waited = 0
    while waited < SEARCH_TIMEOUT:
        time.sleep(2)
        waited += 2
        results = api_get(f"searches/{search_id}")
        state = results.get("state", "")

        # Zbierz wyniki z odpowiedzi od użytkowników
        responses = results.get("responses", [])
        total_files = sum(len(r.get("files", [])) for r in responses)

        if state in ("Completed", "Cancelled") or (waited >= 10 and total_files > 0):
            break

    print(f"  📊 Znaleziono {total_files} plików od {len(responses)} użytkowników")
    return results


def score_file(file_info: dict) -> int:
    """
    Ocenia plik na podstawie formatu i bitrate.
    Wyższy wynik = lepszy plik.
    """
    filename = file_info.get("filename", "").lower()
    bitrate = file_info.get("bitRate", 0)
    size = file_info.get("size", 0)

    score = 0

    # Format
    if filename.endswith(".mp3"):
        score += 100
    elif filename.endswith(".flac"):
        score += 50  # akceptujemy flac jako fallback
    else:
        return 0  # odrzucamy inne formaty

    # Bitrate — premiujemy 320kbps
    if bitrate >= 310:
        score += 200
    elif bitrate >= MIN_BITRATE:
        score += 150
    elif bitrate >= FALLBACK_BITRATE:
        score += 50
    elif bitrate == 0 and size > 3_000_000:
        # Brak info o bitrate ale plik duży — prawdopodobnie ok
        score += 80

    # Rozmiar — większy plik = prawdopodobnie lepsza jakość
    if size > 8_000_000:
        score += 30
    elif size > 5_000_000:
        score += 20

    return score


def pick_best_file(search_results: dict) -> Optional[dict]:
    """Wybiera najlepszy plik z wyników wyszukiwania."""
    candidates = []

    for response in search_results.get("responses", []):
        username = response.get("username", "unknown")
        free_slots = response.get("freeUploadSlots", 0)

        for f in response.get("files", []):
            score = score_file(f)
            if score > 0:
                # Bonus za wolne sloty
                if free_slots > 0:
                    score += 50
                candidates.append({
                    "username": username,
                    "filename": f.get("filename", ""),
                    "size": f.get("size", 0),
                    "bitrate": f.get("bitRate", 0),
                    "score": score,
                })

    if not candidates:
        return None

    candidates.sort(key=lambda c: c["score"], reverse=True)
    best = candidates[0]
    return best


# ── Pobieranie ────────────────────────────────────────────────────────────────

def enqueue_download(username: str, filename: str):
    """Dodaje plik do kolejki pobierania w slskd."""
    api_post(
        f"transfers/downloads/{username}",
        json_data=[{"filename": filename}],
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global SLSKD_URL, SLSKD_API_KEY

    parser = argparse.ArgumentParser(
        description="Pobieraj utwory z Soulseeka via slskd"
    )
    parser.add_argument(
        "playlist",
        help="Ścieżka do pliku z listą utworów",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Tylko wyszukaj i pokaż wyniki, nie pobieraj",
    )
    parser.add_argument(
        "--url",
        default=None,
        help="Adres slskd (domyślnie: http://localhost:5030)",
    )
    parser.add_argument(
        "--api-key",
        default=None,
        help="Klucz API slskd",
    )
    args = parser.parse_args()

    if args.url:
        SLSKD_URL = args.url
    if args.api_key:
        SLSKD_API_KEY = args.api_key

    if not SLSKD_API_KEY:
        print("⚠️  Brak klucza API. Ustaw SLSKD_API_KEY lub użyj --api-key")
        print("   Klucz znajdziesz w konfiguracji slskd (web UI → Settings)")
        sys.exit(1)

    # Sprawdź połączenie
    try:
        api_get("application")
        print(f"✅ Połączono z slskd ({SLSKD_URL})")
    except Exception as e:
        print(f"❌ Nie mogę połączyć się z slskd ({SLSKD_URL}): {e}")
        print("   Upewnij się, że slskd jest uruchomiony.")
        sys.exit(1)

    # Parsuj playlistę
    tracks = parse_playlist(args.playlist)
    if not tracks:
        print("❌ Nie znaleziono utworów w pliku.")
        sys.exit(1)

    print(f"\n📋 Znaleziono {len(tracks)} utworów do pobrania:\n")
    for i, t in enumerate(tracks, 1):
        print(f"  {i:2d}. {t['artist']} — {t['title']}")

    print(f"\n{'='*60}")
    print(f"  Tryb: {'DRY RUN (bez pobierania)' if args.dry_run else 'POBIERANIE'}")
    print(f"  Preferowany format: MP3 >= {MIN_BITRATE}kbps")
    print(f"{'='*60}\n")

    # Przetwarzaj utwory
    downloaded = []
    failed = []

    for i, track in enumerate(tracks, 1):
        print(f"\n[{i}/{len(tracks)}] {track['artist']} — {track['title']}")

        try:
            results = search_and_wait(track["query"])
            best = pick_best_file(results)

            if best:
                ext = os.path.splitext(best["filename"])[1]
                br_info = f"{best['bitrate']}kbps" if best['bitrate'] else "?"
                size_mb = best["size"] / 1_000_000
                print(f"  ✅ Najlepszy: {ext} {br_info} ({size_mb:.1f}MB)")
                print(f"     Od: {best['username']}")
                print(f"     Plik: .../{os.path.basename(best['filename'])}")

                if not args.dry_run:
                    enqueue_download(best["username"], best["filename"])
                    print(f"  📥 Dodano do kolejki pobierania!")

                downloaded.append(track)
            else:
                print(f"  ❌ Nie znaleziono odpowiedniego pliku")
                failed.append(track)

            # Cleanup wyszukiwania
            search_id = results.get("id")
            if search_id:
                try:
                    api_delete(f"searches/{search_id}")
                except Exception:
                    pass

        except Exception as e:
            print(f"  ❌ Błąd: {e}")
            failed.append(track)

        # Przerwa między wyszukiwaniami
        if i < len(tracks):
            time.sleep(DELAY_BETWEEN_SEARCHES)

    # Podsumowanie
    print(f"\n{'='*60}")
    print(f"  PODSUMOWANIE")
    print(f"{'='*60}")
    print(f"  ✅ Znalezione:  {len(downloaded)}/{len(tracks)}")
    print(f"  ❌ Nieudane:    {len(failed)}/{len(tracks)}")

    if failed:
        print(f"\n  Nie znaleziono:")
        for t in failed:
            print(f"    - {t['artist']} — {t['title']}")

    print()


if __name__ == "__main__":
    main()
