# Internet Radio — Specyfikacja techniczna dla Claude Code

## 1. Wizja produktu

Internetowe radio z nowoczesnym UI opartym na **Dynamic Island** (inspiracja: skiper-ui/skiper2). Odtwarzacz "unosi się" nad contentem strony jak notch iPhone'a — rozszerza się i animuje w zależności od stanu (idle, playing, loading, track info). Cały interfejs: Next.js App Router + shadcn/ui + Framer Motion.

---

## 2. Stack technologiczny

| Warstwa | Technologia | Wersja | Powód wyboru |
|---|---|---|---|
| Framework | **Next.js** (App Router) | 15.x | SSR, routing, server components |
| UI Library | **shadcn/ui** | latest | Kopiowalny, customowalny design system |
| Animacje | **Framer Motion** | 11.x | Dynamic Island wymaga `layout`, `AnimatePresence`, spring transitions |
| Ikony | **Lucide React** | latest | Spójność z shadcn |
| Audio | **Howler.js** | 2.x | Abstrakcja nad Web Audio API, streaming, fade, format fallback |
| State | **Zustand** | 5.x | Lekki store dla playera i stacji — zero boilerplate'u |
| Styling | **Tailwind CSS** | 4.x | Wymóg shadcn, utility-first |
| Metadata/SEO | Next.js Metadata API | — | Dynamiczne OG tagi per stacja |
| Linting | **ESLint** + **Prettier** | — | Spójność kodu |
| TypeScript | **strict mode** | 5.x | Bezpieczeństwo typów |

### Opcjonalnie (faza 2+)

| Technologia | Zastosowanie |
|---|---|
| **Icecast / Shoutcast API** | Pobieranie metadanych streamu (teraz gra: artysta + tytuł) |
| **next-pwa** | Installable PWA, background playback |
| **next-themes** | Dark/light mode toggle |
| **Vercel Analytics** | Tracking bez cookies |

---

## 3. Architektura katalogów

```
src/
├── app/
│   ├── layout.tsx              # Root layout, fonty, ThemeProvider
│   ├── page.tsx                # Strona główna — lista stacji
│   ├── station/
│   │   └── [slug]/
│   │       └── page.tsx        # Strona pojedynczej stacji
│   └── api/
│       └── stations/
│           └── route.ts        # GET /api/stations — lista stacji
│
├── components/
│   ├── ui/                     # shadcn/ui components (Button, Card, etc.)
│   │
│   ├── dynamic-island/
│   │   ├── DynamicIsland.tsx          # Kontener z AnimatePresence
│   │   ├── IslandIdle.tsx             # Stan idle — logo + nazwa radia
│   │   ├── IslandPlaying.tsx          # Stan playing — waveform + track info + controls
│   │   ├── IslandLoading.tsx          # Stan loading — skeleton pulse
│   │   ├── IslandError.tsx            # Stan error — retry button
│   │   └── island-variants.ts         # Framer Motion variant config
│   │
│   ├── station/
│   │   ├── StationCard.tsx            # Karta stacji na liście
│   │   └── StationGrid.tsx            # Grid/lista stacji
│   │
│   └── layout/
│       ├── Header.tsx
│       └── Footer.tsx
│
├── hooks/
│   ├── useAudioPlayer.ts      # Hook opakowujący Howler.js
│   ├── useStreamMetadata.ts   # Polling metadanych streamu (teraz gra)
│   └── useMediaSession.ts     # Media Session API (OS controls)
│
├── stores/
│   └── playerStore.ts         # Zustand: currentStation, status, volume, metadata
│
├── lib/
│   ├── stations.ts            # Definicja stacji (statyczny JSON lub fetch)
│   └── audioFormats.ts        # Helper: format detection, fallback chain
│
├── types/
│   └── index.ts               # Station, PlayerStatus, TrackMetadata, IslandView
│
└── config/
    └── stations.json          # Dane stacji radiowych
```

---

## 4. Kluczowe typy (types/index.ts)

```typescript
export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type IslandView = "idle" | "compact" | "expanded";

export interface Station {
  slug: string;
  name: string;
  genre: string;
  streamUrl: string;
  fallbackUrl?: string;
  logoUrl: string;
  color: string;           // Accent color per station
  metadataEndpoint?: string;
}

export interface TrackMetadata {
  artist: string;
  title: string;
  album?: string;
  artworkUrl?: string;
}

export interface PlayerState {
  currentStation: Station | null;
  status: PlayerStatus;
  volume: number;
  isMuted: boolean;
  metadata: TrackMetadata | null;
  islandView: IslandView;

  // Actions
  playStation: (station: Station) => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setIslandView: (view: IslandView) => void;
}
```

---

## 5. Komponent Dynamic Island — logika stanów

```
┌─────────────────────────────────────────────────────────────┐
│  IDLE           →  pill shape, logo + "Radio Name"          │
│  LOADING        →  pill expands, pulsing skeleton           │
│  PLAYING        →  expanded: waveform + track + controls    │
│  COMPACT        →  click to collapse: small pill + ♫ icon   │
│  ERROR          →  red accent, retry button                 │
└─────────────────────────────────────────────────────────────┘
```

### Reguły przejść (Framer Motion)

- Użyj `layout` prop na kontenerze — Framer automatycznie animuje zmianę wymiarów
- `AnimatePresence` z `mode="popLayout"` do swap contentu bez jumpów
- Transitions: `type: "spring", stiffness: 400, damping: 30` — Apple-like bounce
- Każdy stan to osobny komponent renderowany warunkowo w `AnimatePresence`

### Interakcje

- **Click na idle island** → otwórz station picker (shadcn Sheet/Drawer)
- **Click na playing island** → toggle compact/expanded
- **Long press / swipe down** → force expand
- **Tap play/pause** w expanded → toggle playback
- **Volume slider** — shadcn Slider, widoczny tylko w expanded

---

## 6. Audio — hook useAudioPlayer

```typescript
// Odpowiedzialność: TYLKO zarządzanie instancją Howler + reaktywne eventy
// Nie zna UI, nie zna stacji — przyjmuje URL, zwraca status

interface UseAudioPlayerReturn {
  play: (streamUrl: string) => void;
  stop: () => void;
  setVolume: (level: number) => void;   // 0-1
  toggleMute: () => void;
  status: PlayerStatus;
  duration: number;
}
```

### Kluczowe decyzje audio

- **Howler.js** zamiast surowego `<audio>` — obsługuje format fallback (mp3 → aac → ogg), fade in/out, i normalizuje zachowania cross-browser
- **Streaming**: `html5: true` w Howler żeby uniknąć pełnego buforowania (stream radio nie ma końca)
- **Reconnect**: przy `onloaderror` / `onplayerror` — exponential backoff z max 3 retries, potem status `error`
- **Fade**: 300ms fade in przy play, 200ms fade out przy stop — brak twardego clipa

---

## 7. Metadata streamu — hook useStreamMetadata

Polling co 10s endpointu stacji (Icecast JSON, Shoutcast XML, lub custom API):

```typescript
// Zwraca reaktywne TrackMetadata | null
// Retry logic wbudowany
// Automatycznie czyści interval przy unmount
```

Fallback: jeśli endpoint nie istnieje → pokazuj nazwę stacji zamiast "teraz gra".

---

## 8. Media Session API — hook useMediaSession

Integracja z OS-level controls (lockscreen, notification center, bluetooth):

```typescript
// Ustawia: title, artist, artwork
// Rejestruje handlery: play, pause, stop, previoustrack, nexttrack
// previoustrack / nexttrack → przeskocz do prev/next stacji na liście
```

---

## 9. Zustand Store (stores/playerStore.ts)

```typescript
// Jeden flat store — bez zagnieżdżonych obiektów
// Akcje jako metody store, nie oddzielne dispatche
// Middleware: persist (localStorage) — zapamiętaj volume + ostatnią stację
// Selektor pattern: komponenty subskrybują TYLKO pola których potrzebują
//   → usePlayerStore(state => state.status)   zamiast   usePlayerStore()
```

---

## 10. Reguły czystego kodu (na bazie Clean Code + Refactoring)

### Naming

- `PlayerStatus` nie `status` ani `StatusType` ani `PlayerStatusEnum`
- `playStation(station)` nie `handlePlay(data)` nie `doPlay(s)`
- `useStreamMetadata(endpoint)` nie `useMeta(url)` nie `useData(ep)`
- Jedno słowo per koncept w całym repo: `station` (nie `channel` / `stream` / `source` zamiennie)

### Functions

- Każdy hook robi **jedną rzecz**: `useAudioPlayer` nie wie o metadanych, `useStreamMetadata` nie wie o Howlerze
- Max 3 argumenty; jeśli więcej → `options` object
- Nie zwracaj `null` z hooków — zwracaj obiekt z polem `status: "idle"` i pustymi wartościami domyślnymi
- Wydziel `try/catch` do osobnych funkcji: `attemptReconnect()`, `handleStreamError()`

### Components

- Każdy komponent Dynamic Island (`IslandIdle`, `IslandPlaying`, itd.) to **max 50 linii** — jeśli rośnie, extract
- Zero logiki biznesowej w komponentach UI — deleguj do hooków i store
- Props: max 3-4 per komponent; jeśli więcej → wyciągnij dane ze store wewnątrz komponentu
- Żadnych `any` w TypeScript — strict mode, discriminated unions na `PlayerStatus`

### State management

- **Flat store** — nie `{ player: { station: { metadata: ... } } }` tylko top-level pola
- **Selektory** — nigdy nie subskrybuj całego store; pattern: `usePlayerStore(s => s.volume)`
- **Derived state** obliczaj w komponentach: `const isActive = status === "playing" || status === "loading"` — nie duplikuj w store

### Error handling

- Howler errors → mapuj na domenowy `PlayerError` type z czytelnym `message`
- Nigdy nie pokazuj surowych error messages użytkownikowi
- Każdy error state ma jasną ścieżkę recovery (retry button, fallback URL)

### File organization

- Imports: zewnętrzne → wewnętrzne → typy → style (sortuj alfabetycznie w grupach)
- Jeden eksport per plik (komponent = plik); barrel exports (`index.ts`) tylko na poziomie katalogu
- Testy obok kodu: `useAudioPlayer.ts` → `useAudioPlayer.test.ts`

---

## 11. UI / Design direction

### Estetyka

- **Mood**: dark, moody, premium — jak interfejs Spotify meets Apple Dynamic Island
- **Background**: ciemny gradient (zinc-950 → neutral-900) z subtle noise texture
- **Accent**: per-station color (`station.color`) — propagowany przez CSS custom property
- **Typography**: display font (np. **Satoshi** lub **General Sans**) dla nazwy radia + mono (np. **JetBrains Mono**) dla metadata "teraz gra"
- **Dynamic Island**: czarny pill (#000) z `box-shadow: 0 0 0 2px rgba(255,255,255,0.1)` — jak prawdziwy notch

### shadcn/ui components do użycia

- `Button` — play/pause, volume, mute
- `Slider` — volume control
- `Card` — station cards na liście
- `Sheet` / `Drawer` — station picker (mobile: bottom sheet, desktop: side sheet)
- `Badge` — genre tag na station card
- `Skeleton` — loading states
- `Tooltip` — volume level, station info

### Responsive

- Mobile: Dynamic Island przyklejony u góry (fixed), station list jako full-width karty
- Desktop: Dynamic Island wycentrowany u góry, station grid 3-4 kolumny
- Island na mobile: tap = toggle compact/expanded; na desktop: hover preview + click

---

## 12. Kolejność implementacji (task breakdown)

### Faza 1: Fundament (MVP)

```
1.1  Scaffold Next.js + TypeScript strict + Tailwind + shadcn/ui init
1.2  Dodaj Framer Motion + Howler.js + Zustand
1.3  Zdefiniuj typy (types/index.ts) + statyczny stations.json (3-5 stacji)
1.4  Zbuduj playerStore (Zustand) — flat state, persist middleware
1.5  Zbuduj useAudioPlayer hook — play/stop/volume/mute z Howler
1.6  Zbuduj DynamicIsland kontener + IslandIdle + IslandPlaying
1.7  Podłącz store → island → hook — odtwarzanie działa
1.8  StationCard + StationGrid — lista stacji, click = play
1.9  Layout: Header + fixed DynamicIsland + main content area
```

### Faza 2: Polish

```
2.1  IslandLoading + IslandError stany
2.2  Animacje spring transitions między stanami island
2.3  useStreamMetadata hook — polling teraz gra
2.4  useMediaSession hook — OS controls
2.5  Volume slider w expanded island
2.6  Station picker (Sheet/Drawer) z mobile bottom sheet
2.7  Per-station accent color (CSS custom property)
2.8  Waveform / audio visualization w IslandPlaying
2.9  Reconnect logic z exponential backoff
```

### Faza 3: Production

```
3.1  PWA manifest + service worker (background playback)
3.2  Dark/light theme toggle (next-themes)
3.3  SEO: dynamic metadata per station page
3.4  Accessibility: aria-labels, keyboard nav, focus management
3.5  Performance: lazy load station images, prefetch streams
3.6  Error boundary na poziomie app
3.7  Analytics (opcjonalnie)
```

---

## 13. Komendy startowe

```bash
# Scaffold
npx create-next-app@latest internet-radio --typescript --tailwind --app --src-dir --eslint
cd internet-radio

# shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card slider sheet badge skeleton tooltip drawer

# Dependencies
npm install framer-motion howler zustand
npm install -D @types/howler

# Opcjonalnie
npm install next-themes next-pwa
```

---

## 14. Przykłady API kontraktów

### GET /api/stations

```json
[
  {
    "slug": "chillhop",
    "name": "Chillhop Radio",
    "genre": "Lo-fi / Chillhop",
    "streamUrl": "https://streams.chillhop.com/listen",
    "logoUrl": "/stations/chillhop.svg",
    "color": "#F4845F",
    "metadataEndpoint": "https://api.chillhop.com/now-playing"
  }
]
```

### Stream metadata response (generic)

```json
{
  "artist": "Nymano",
  "title": "Solace",
  "album": "Chillhop Essentials",
  "artworkUrl": "https://cdn.example.com/artwork/123.jpg"
}
```

---

## 15. Zasady dla Claude Code

1. **Zanim napiszesz kod** — przeczytaj istniejące pliki w katalogu. Nie twórz duplikatów.
2. **Jedno zadanie = jeden commit** — nie mieszaj feature + refactor.
3. **Nazwy plików = PascalCase** dla komponentów, **camelCase** dla hooków/utils.
4. **Każdy nowy komponent** — sprawdź czy da się użyć istniejącego shadcn/ui component zamiast pisać custom.
5. **Testy** — pisz przynajmniej smoke testy dla hooków (useAudioPlayer, useStreamMetadata).
6. **Nie dodawaj** abstrakcji "na zapas" (YAGNI). Jeśli jest jedna stacja — nie buduj multi-tenant architecture.
7. **Reguła 3 uderzeń** — duplication w 2 miejscach OK. W 3 — extract.
8. **Howler instance** — zarządzana w hooku, nigdy jako singleton globalny. Nowa instancja per zmiana stacji (poprzednią unload).
9. **Animacje** — definiuj variants w osobnym pliku (`island-variants.ts`), nie inline w JSX.
10. **Zero `console.log`** w finalnym kodzie — użyj warunkowego loggera w dev.
