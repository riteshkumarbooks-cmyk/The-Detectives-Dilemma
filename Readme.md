# 🕵️ The Detective's Dilemma — Development Guide

## Project Overview
Episodic mobile detective game featuring a talking cat AI assistant.
Player takes on cases for multiple clients simultaneously — parallel storylines, not sequential.

---

## 🏗️ Actual Tech Stack (What We're Using)

| Layer | Technology |
|---|---|
| Framework | Expo SDK 54 (managed workflow) |
| Navigation | Expo Router 6.x (file-based) |
| Language | TypeScript |
| React | 19.1.0 |
| React Native | 0.81.5 |
| Auth + DB | Firebase (Auth + Firestore JS SDK v11) |
| Local cache | AsyncStorage |
| Sensors | expo-sensors (gyroscope/DeviceMotion) |
| Media storage | AWS S3 (private buckets) — images + videos per episode |
| Voice/TTS | ElevenLabs API — all dialogue lines are voiced |
| Audio/Video | expo-av — playback of S3-hosted MP3s and MP4s |
| Install command | `npm install --legacy-peer-deps` |

> ⚠️ Original README referenced Supabase, PostgreSQL, Express.js, Redux — **we are NOT using these**. Firebase handles auth + data. No custom backend server.

---

## 🎙️ ElevenLabs Voice Integration

All NPC and cat assistant dialogue lines are voiced using the ElevenLabs TTS API.

### Flow
```
Episode dialogue text (stored in Firestore)
  → ElevenLabs API called at content-creation time (not at runtime)
  → MP3 file generated and uploaded to S3
  → S3 URL stored back in Firestore alongside the dialogue line
  → App streams/downloads MP3 via expo-av at playback time
```

### Why pre-generate (not real-time)?
- Cheaper: ElevenLabs charges per character — pre-generate once, play forever
- Faster: No API latency during gameplay
- Offline-capable: Audio can be cached locally after first play

### Voice assignments (to be defined per character)
- Each NPC gets a consistent ElevenLabs voice ID stored in Firestore
- The cat assistant has its own voice ID
- Player detective has no voice (player = silent protagonist)

### Env variable needed
```
EXPO_PUBLIC_ELEVENLABS_API_KEY   (used only in content tooling, NOT in app)
ELEVENLABS_API_KEY               (server-side / content pipeline only)
```

> ⚠️ ElevenLabs API key must NEVER be in the mobile app bundle — audio is pre-generated and served from S3.

---

## 🎬 AWS S3 Media Architecture

All images, videos, and pre-generated audio live in S3.

### Bucket structure
```
s3://detectives-dilemma-media/
  clients/{clientId}/
    avatar.png
    seasons/{seasonId}/
      episodes/{episodeId}/
        scene_{n}.jpg          ← story scene images
        video_{n}.mp4          ← cinematic video clips
        dialogue_{n}.mp3       ← pre-generated ElevenLabs audio
  characters/
    man-young.png
    woman-mid.png
    ... (6 character portraits)
```

### App download flow
1. Firestore episode doc contains `mediaBaseUrl` (S3 or CDN URL prefix)
2. App builds full asset URLs: `mediaBaseUrl + /scene_1.jpg`
3. Images loaded via `<Image source={{ uri }}>`
4. Audio/video played via `expo-av`
5. Phase 5: Add Cloudflare CDN in front of S3 for global low-latency

### Env variables needed
```
EXPO_PUBLIC_S3_BASE_URL          ← public CDN/S3 base URL for media
AWS_ACCESS_KEY_ID                ← server-side content pipeline only
AWS_SECRET_ACCESS_KEY            ← server-side content pipeline only
AWS_REGION
S3_BUCKET_NAME
```

> ⚠️ AWS credentials must NEVER be in the mobile app. App only reads public/pre-signed URLs from Firestore.

---

## 🎮 Game Hierarchy

```
Player Detective (auto-assigned from age + gender)
  └── Clients Tab
        └── Client (e.g. Lady Ashworth)
              ├── Season 1
              │     ├── Episode 1  (images + choice narrative + videos + mini-games)
              │     ├── Episode 2
              │     └── Episode 3
              ├── Season 2
              └── Gallery (client-specific media)
```

- Multiple clients can be active **simultaneously** (parallel stories)
- Each client has their own seasons, episodes, and gallery
- Global Gallery tab aggregates media across all clients

---

## 📱 Navigation Structure (Tab Bar)

```
🏠 Home  |  👥 Clients  |  🕵️ Profile  |  🖼️ Gallery
```

| Tab | Content |
|---|---|
| **Home** | Detective standing in office (parallax depth effect via gyroscope) |
| **Clients** | Grid of client cards → Client Detail (Episodes + Gallery) |
| **Profile** | Detective stats, rank, case history, relationship matrix |
| **Gallery** | Global media across all clients |

### Client Detail Screen (nested inside Clients tab)
- Two inner tabs: **Episodes** and **Gallery**
- Episodes tab: Season accordion → episode cards (locked/unlocked)
- Gallery tab: Client-specific media (Phase 5)

---

## 🗂️ Firestore Schema

### ⚠️ Data ownership rules
- `users/{uid}/*` — player-owned data. Writable only by the owning user.
- `clients/*`, `npcs/*` — game content. Written by us (admin/script), read-only for players.

---

### 💰 Monetization Model

Each episode falls into exactly one access tier, checked in order:

| Priority | Tier | Condition | How unlocked |
|---|---|---|---|
| 1 | **Free** | `episode.order ≤ client.freeEpisodeCount` (3) | Automatic — first 3 episodes per client |
| 2 | **Season owned** | Season purchase entitlement exists | One-time IAP — unlocks full season, no ads |
| 3 | **Ad-unlocked** | Episode ad entitlement exists | Watch 5 ads → permanently unlocks that episode |
| 4 | **Locked** | None of the above | Show paywall: Buy Season OR Watch Ads |

> `freeEpisodeCount` counts total episodes played **across all seasons of that client**, not per season.

---

```
── Player data (per-user, writable only by owner) ───────────────────────────

users/{uid}
  uid:           string
  displayName:   string
  email:         string
  authProvider:  'google' | 'apple' | 'email'
  createdAt:     Timestamp
  lastActiveAt:  Timestamp
  character: {
    firstName:        string
    lastName:         string
    gender:           'Male' | 'Female'
    age:              string        (18–70)
    sexualPreference: 'Men' | 'Women' | 'Both' | 'None'
    casesWon:         number
    wrongGuesses:     number
    updatedAt:        Timestamp
  }
  relationships: [              ← GLOBAL across all clients, grows with gameplay
    {
      npcId:   string
      value:   number           (-100 to +100)
      status:  'Romance' | 'Friend' | 'Enemy' | 'Neutral'
    }
  ]

users/{uid}/progress/{clientId}
  currentSeasonId:      string
  currentEpisodeId:     string
  completedEpisodes:    string[]   ← episode IDs completed
  episodesPlayedCount:  number     ← compared to client.freeEpisodeCount for free tier
  lastPlayedAt:         Timestamp

users/{uid}/entitlements/season_{clientId}_{seasonId}
  type:           'season_purchased'
  productId:      string           ← IAP product ID
  purchasedAt:    Timestamp
  purchaseToken:  string           ← IAP receipt (verified Phase 5)

users/{uid}/entitlements/episode_{clientId}_{seasonId}_{episodeId}
  type:           'ads_completed'
  adsWatched:     number
  completedAt:    Timestamp

── Game content (written by us, read-only for players) ──────────────────────

clients/{clientId}
  name:              string
  tagline:           string
  description:       string
  avatarUrl:         string        ← S3 URL
  voiceId:           string        ← ElevenLabs voice ID for this client's narration
  order:             number        ← display order in Clients tab
  releaseStatus:     'available' | 'coming_soon'
  freeEpisodeCount:  number        ← e.g. 3 (total free across all seasons)

clients/{clientId}/seasons/{seasonId}
  title:             string
  order:             number
  unlockCondition:   string        ← story prerequisite e.g. 'Complete Season 1'
  adsPerEpisode:     number        ← e.g. 5 ads to unlock one episode
  productId:         string        ← IAP product ID e.g. 'com.detectivesdilemma.ashworth.s1'
  price:             number        ← display price e.g. 1.99

clients/{clientId}/seasons/{seasonId}/episodes/{episodeId}
  title:             string
  order:             number        ← global seq across all seasons (1,2,3…) for free count
  unlockCondition:   string        ← e.g. 'Complete Episode 2'
  mediaBaseUrl:      string        ← S3 base URL for this episode's assets
  scenes: [
    {
      sceneId:      string
      type:         'image' | 'video' | 'dialogue' | 'choice' | 'minigame'
      imageUrl:     string          ← S3 path relative to mediaBaseUrl
      videoUrl:     string          ← S3 path relative to mediaBaseUrl
      dialogueText: string
      audioUrl:     string          ← pre-generated ElevenLabs MP3 on S3
      speakerNpcId: string
      choices: [
        {
          text:               string
          nextSceneId:        string
          relationshipEffect: { npcId: string; delta: number }
        }
      ]
    }
  ]

npcs/{npcId}                       ← TOP-LEVEL GLOBAL (not per-client)
  name:              string
  role:              string
  description:       string
  avatarUrl:         string        ← S3 URL
  voiceId:           string        ← ElevenLabs voice ID
  appearsInClients:  string[]      ← which clientIds this NPC appears in
```

---

### Access Logic (implemented in `src/services/entitlements.ts`)

```typescript
async function canPlayEpisode(
  uid, clientId, seasonId, episodeId, episodeOrder
): Promise<'free' | 'owned' | 'ads' | 'locked'> {

  const client   = await getClient(clientId);
  const progress = await getProgress(uid, clientId);

  // Tier 1 — Free
  if (progress.episodesPlayedCount < client.freeEpisodeCount) return 'free';

  // Tier 2 — Season purchased
  const seasonKey = `season_${clientId}_${seasonId}`;
  if (await getEntitlement(uid, seasonKey)) return 'owned';

  // Tier 3 — Ad-unlocked
  const episodeKey = `episode_${clientId}_${seasonId}_${episodeId}`;
  if (await getEntitlement(uid, episodeKey)) return 'ads';

  return 'locked'; // Show paywall: Buy Season OR Watch Ads
}
```

---

## 👥 Placeholder Clients (Phase 2)

| Client | Case | Status |
|---|---|---|
| Lady Eleanor Ashworth | "The Missing Heirloom" | Active |
| Professor Henry Morley | "The Academic's Secret" | Active |
| [Locked] | Unlock by completing Season 1 | Locked |

---

## 🤝 Global NPCs (top-level `npcs/` collection)

NPCs are global — relationships carry over across all clients.

| NPC ID | Name | Role | Initial Value | Initial Status |
|---|---|---|---|---|
| `marcus-webb` | Marcus Webb | Rival Detective | 0 | Neutral |
| `luna` | Luna | Informant Cat | +30 | Friend |
| `commissioner-hayes` | Commissioner Hayes | Superior | 0 | Neutral |
| `victoria-cross` | Victoria Cross | Suspect | -40 | Enemy |

Relationship values update through episode choices. Stored in `users/{uid}.relationships[]`.

---

## 🧩 Character Auto-Assignment

Player fills in: First Name, Last Name, Gender (Male/Female), Age (18–70), Romance Interest

```
Age ≤ 30  → young  (Jake Carter / Zoe Hart)
Age ≤ 45  → mid    (Marcus Reid / Diana Cross)
Age > 45  → senior (Victor Kane / Eleanor Voss)
```

Player's own name always displayed — detective template only affects appearance.

---

## 🎭 Rank System

| Cases Won | Wrong Guesses | Rank |
|---|---|---|
| 0 | any | Novice |
| 1–4 | any | Detective |
| 5–9 | any | Inspector |
| 10–19 | <5 | Chief Inspector |
| 20+ | <3 | Master Detective |

---

## ✅ Phase Status

### Phase 1: Core Identity & Auth — COMPLETE ✅
- Firebase Auth (Email/Password, Google button UI)
- Character creation form (name, gender, age, romance interest)
- Character auto-assignment (6 profiles based on gender+age)
- Firestore profile sync (cross-device persistence)
- Home screen: detective standing in office with parallax depth effect

### Phase 2: Character System & Navigation — IN PROGRESS 🔄
- [x] Bottom tab bar (Home | Clients | Profile | Gallery)
- [x] Clients tab — client card grid (hardcoded, needs Firestore)
- [x] Client detail screen — Episodes + Gallery inner tabs (hardcoded, needs Firestore)
- [x] Profile tab — stats + relationship matrix (seeded to Firestore)
- [x] Data model finalised — clients, seasons, episodes, npcs, entitlements
- [ ] **NEXT:** Seed `clients/` + `npcs/` collections into Firestore
- [ ] Wire `clients.tsx` and `client/[id].tsx` to read from Firestore
- [ ] Firestore Security Rules updated for `clients/` and `npcs/`

### Phase 3: Episode Framework & Save System — PENDING ⏳
- Episode playback engine (scenes: image → dialogue → choice → next)
- Save progress to `users/{uid}/progress/{clientId}` after each episode
- Entitlements service (`src/services/entitlements.ts`) — free/owned/ads/locked
- Paywall UI: "Buy Season" (IAP) + "Watch 5 Ads" options
- Wire episode order → ad/purchase gate enforcement

### Phase 4: Mini-Games & Interactive Systems — PENDING ⏳
- Hidden Objects, Rock-Paper-Scissors Combat, Interrogation mini-games
- Dialogue system with branching logic
- Talking cat assistant with contextual hints

### Phase 5: Media, Gallery & Polish — PENDING ⏳
- S3 + Cloudflare CDN for media assets
- Gallery tab (video player, photo viewer, favorites)
- Google Sign-In + Apple Sign-In (EAS Build required)
- Analytics (Sentry), store compliance, TestFlight beta

---

## 🔑 Environment Variables (.env)

```
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
```

---

## 📁 Key Files

| File | Purpose |
|---|---|
| `app/_layout.tsx` | Root layout, auth gate, navigation redirect |
| `app/index.tsx` | Splash screen (shows splash.png for 1.5s) |
| `app/(auth)/login.tsx` | Login screen |
| `app/(auth)/register.tsx` | Registration + Firestore profile creation |
| `app/(main)/index.tsx` | Character creation form (redirects to tabs if profile exists) |
| `app/(main)/(tabs)/home.tsx` | Home tab — office scene + parallax detective |
| `app/(main)/(tabs)/clients.tsx` | Clients tab — client card grid |
| `app/(main)/(tabs)/profile.tsx` | Profile tab — stats + relationship matrix |
| `app/(main)/(tabs)/gallery.tsx` | Gallery tab — placeholder (Phase 5) |
| `app/(main)/client/[id].tsx` | Client detail — Episodes + Gallery inner tabs |
| `src/services/entitlements.ts` | Access tier logic (free/owned/ads/locked) |
| `app/(main)/(tabs)/_layout.tsx` | Tab bar layout (Phase 2+) |
| `src/config/firebase.ts` | Firebase init (AsyncStorage persistence) |
| `src/services/auth.ts` | Auth functions |
| `src/hooks/useAuth.ts` | onAuthStateChanged hook |
| `src/constants/colors.ts` | Design tokens (noir dark theme) |

---

## 🎨 Design Tokens

```
Background:  #0D0D0D
Gold accent: #D4AF37
Surface:     #1A1A1A
Text light:  #F5F5F5
Text muted:  #888888
Danger:      #E53E3E
```

---

## 📋 Gameplay Systems (Phase 4+)

### Episode Sequence
1. Load → fetch episode definition + save state
2. Initialize → apply stat modifiers, relationship bonuses
3. Story → render images/videos/dialogue
4. Interact → mini-games or choice points
5. Resolve → update stats/clues/relationships
6. Save → upsert save with full state
7. Unlock → grant new episodes/scenes/clues

### Mini-Game Types (Phase 4)
- Hidden Objects
- Rock-Paper-Scissors Combat
- Interrogation / Dialogue Deduction

### Talking Cat Assistant (Phase 4)
- Floating non-intrusive UI element
- Contextual hints near interactive elements
- Personality shifts based on relationship score
- Idle animations (blink, tail sway)
