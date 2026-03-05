🕵️ Detective Cat Mobile App - AI
Development Guide
This README provides comprehensive, production-grade instructions for building a scalable
mobile detective game featuring a talking cat assistant. Designed for AI agents and
engineering teams, it includes architecture, security specs, API contracts, phased delivery,
and deployment readiness.
📋 Project Overview
Core Concept
● Detective game with multiple cases to solve across episodic seasons
● Player character communicates with animals — primary assistant is a talking cat with
personality and context-aware guidance
● Card-based character system with unlockable content, stats, and relationship
progression
● Persistent, cross-device saves per character/season/episode
● Rich media integration: videos, scene images, interactive dialogue, and mini-games
Key Features
1. Gallery
Four main tabs: Character Selection, Current Character, Detective Stats, Character
2. Comprehensive stats system (Intelligence, Fighting, Tech, Charisma, Durability) — all
mutable via gameplay
3. Relationship tracking with numerical values (-100 to +100) and status types
(Romance/Friend/Enemy/Neutral)
4. Five integrated mini-game types: Hidden Objects, Rock-Paper-Scissors Combat, Quick
Time Events, Interrogations, Puzzle Deduction
5. Persistent save system with full state serialization, versioned schema, and conflict
resolution
6. Secure, compliant authentication supporting Google, Apple, Email/Password, and
anonymous guest mode
7. Media served via CDN-backed S3 with pre-signed upload/download URLs
🛠️ Technical Requirements
Technology Stack
● Frontend: React Native 0.74+ (iOS & Android), TypeScript, Redux Toolkit, React
Query, React Native Keychain
● Backend: Node.js 20+, Express.js, PostgreSQL 15+, Redis 7+, AWS SDK v3
● Authentication: Supabase Auth (production-ready, GDPR-compliant, supports
SIWA/Google/email/password)
● Media Storage: AWS S3 (private buckets), Cloudflare CDN (for global low-latency
delivery)
● Monitoring: Sentry (frontend), Prometheus + Grafana (backend), Logtail for
structured logging
Architecture Pattern
Layered architecture with strict separation:
● Presentation Layer (React Native): UI, navigation, local caching, offline-first sync
● Business Logic Layer (Node.js): Game rules, stat calculations, relationship logic,
episode validation
● Data Access Layer (PostgreSQL + Redis): ACID-compliant persistence, optimized
queries, caching layer for hot data
● Infrastructure Layer (AWS/Cloudflare): Auth, storage, CDN, observability
All layers communicate via well-defined interfaces — no direct DB access from frontend.
🔐 Authentication & Identity Architecture
To support millions of users securely and comply with Apple App Store, Google Play, and
GDPR requirements:
Supported Providers:
● ✅ Google Sign-In (OAuth 2.0 PKCE)
● ✅ Sign In with Apple (SIWA) — mandatory for iOS distribution
● ✅ Email/Password (with passwordless option and MFA)
● ✅ Anonymous Guest Mode (auto-converted on first save or purchase)
Security Guarantees:
● • JWTs signed with RS256 (private key secured in environment, public key exposed
for verification)
● • Access tokens expire in 15 minutes; refresh tokens rotate on use and expire in 7
days
● • All auth endpoints rate-limited (5 attempts/IP/minute) and protected against
credential stuffing
● • No PII stored in `users` table — only `auth_provider`, `provider_id`, `email_hash`,
`created_at`, `last_active_at`
● • Profile data (name, avatar, preferences) stored separately in encrypted `profiles`
table
Database Schema Snippet:
```sql -- users (immutable identity) CREATE TABLE users ( id UUID PRIMARY KEY DEFAULT
gen_random_uuid(), auth_provider TEXT NOT NULL CHECK (auth_provider IN ('google',
'apple', 'email', 'anonymous')), provider_id TEXT NOT NULL, email_hash TEXT, created_at
TIMESTAMPTZ DEFAULT NOW(), last_active_at TIMESTAMPTZ ); -- profiles (PII +
preferences) CREATE TABLE profiles ( user_id UUID PRIMARY KEY REFERENCES users(id) ON
DELETE CASCADE, name TEXT, avatar_url TEXT, preferred_language TEXT DEFAULT 'en',
theme_preference TEXT DEFAULT 'system', created_at TIMESTAMPTZ DEFAULT NOW() );
```
🔗 Frontend-Backend Integration
All communication occurs via RESTful JSON APIs over HTTPS (TLS 1.3 enforced).
Request Contract:
● • Authorization: Bearer JWT in `Authorization` header
● • Content-Type: `application/json`
● • Accept: `application/json`
● • Client identification via `X-Client-ID` (app bundle ID) and `X-Device-ID` (UUID)
Response Contract:
● • Success: HTTP 200–299 + JSON body with `data`, `meta` (pagination), `links`
(HATEOAS)
● • Errors: Standard HTTP codes (`401`, `403`, `404`, `422`, `429`, `500`) + consistent
error object:
```json { "error": "validation_failed", "message": "Clue ID not found", "details": { "clue_id":
"invalid" } } ```
Media Handling (S3 + CDN)
All media assets are stored in private S3 buckets and served via Cloudflare CDN.
Upload Flow (Secure & Scalable):
● 1. App requests pre-signed URL: `POST /api/v1/media/upload-
url?filename=scene1.mp4&type=video&character_id=abc123`
● 2. Backend validates permissions, generates time-limited (15m), scoped S3 presigned
URL
● 3. App uploads directly to S3 using that URL
● 4. Backend receives S3 event → creates `media` record with `s3_key`, `duration`,
`thumbnail_url`, `transcoded_status`
Download Flow:
● • Backend returns short-lived (1h), CDN-cached, signed media URLs in API responses
● • Example response field: `"video_url":
"https://cdn.detectivecat.app/v1/episodes/789/video.mp4?token=xyz"`
📁 Backend API Specification (OpenAPI 3.0 Summary)
Full OpenAPI 3.0 YAML spec is available at `/openapi.yaml` in the backend repo. Key
endpoints include:
Auth Endpoints:
● • `POST /api/v1/auth/signin/google` — initiate Google flow
● • `POST /api/v1/auth/signin/apple` — SIWA callback handler
● • `POST /api/v1/auth/signup/email` — email/password registration
Character & Stats Endpoints:
● • `GET /api/v1/characters` — list unlocked characters (paginated)
● • `GET /api/v1/characters/{id}` — get character + latest save
● • `PATCH /api/v1/characters/{id}/stats` — update detective stats
Episode & Save Endpoints:
● • `GET /api/v1/characters/{id}/episodes` — list episodes for character
● • `GET /api/v1/episodes/{id}?save_slot=latest` — load episode + save state
● • `POST /api/v1/saves` — create/update save (upsert)
● • `GET /api/v1/saves/{id}/diff` — compute stat/relationship deltas since last save
Media Endpoints:
● • `POST /api/v1/media/upload-url` — request pre-signed upload URL
● • `GET /api/v1/media/thumbnail/{key}` — generate on-demand thumbnail
📱 UI Implementation Specifications
Tab 1: Character Selection Screen
Required Components:
● • CharacterGrid: Responsive grid of character cards (max 4 columns on tablet, 2 on
mobile)
● • CharacterCard: Avatar, name, unlock status, relationship summary, 3-stat preview
bar
● • FilterBar: Toggle filters: 'Unlocked', 'Romance', 'Friend', 'High Intelligence', 'New
Episodes'
● • UnlockModal: Shows required clues/stat thresholds to unlock locked characters
Functionality: Smooth animations, tap-to-select, visual feedback on interaction, accessibility
labels for screen readers.
Tab 2: Current Character Screen
Required Components:
● • CharacterProfile: Full profile card with animated avatar, bio, current stats,
relationship matrix
● • SeasonEpisodeList: Expandable accordion for seasons → episodes, with progress
rings
● • QuickActions: 'Resume Last', 'Start New Season', 'View Gallery' buttons
Functionality: Deep linking to episodes, persistent scroll position, offline-capable caching.
Tab 3: Detective Stats Screen
Required Components:
● • StatsOverview: Animated radial bars for core stats (Intelligence, Fighting, Tech,
Charisma, Durability)
● • RelationshipMatrix: Interactive grid showing all characters + relationship
type/value + trend arrow
● • AchievementsList: Scrollable list of achievements with icons, descriptions, and
unlock dates
● • ProgressCharts: Line charts (using victory-native) showing stat growth over last 30
days
Tab 4: Character Gallery Screen
Required Components:
● • MediaGrid: Masonry layout of thumbnails (photos/videos), with badges: 'Scene',
'Clue', 'Romance', 'Unlock'
● • VideoPlayer: Custom player with subtitle support, speed control, chapter
navigation
● • PhotoViewer: Zoomable image viewer with swipe navigation
● • FavoritesManager: Tabbed interface: 'All', 'Scenes', 'Clues', 'Romance Moments'
🎮 Gameplay Systems Implementation
Episode Structure
Each episode follows this immutable sequence:
8. 1. Load → Fetch episode definition + latest save state
9. 2. Initialize → Apply stat modifiers, relationship bonuses, clue unlocks
10. 3. Story → Render images/videos/dialogue (cached locally when possible)
11. 4. Interact → Execute mini-games or choice points
12. 5. Resolve → Calculate outcomes, update stats/clues/relationships
13. 6. Save → Upsert save with full game state + delta summary
14. 7. Unlock → Grant new episodes/scenes/clues based on conditions
Mini-Game Types
All mini-games must support:
● • Adaptive difficulty scaling (based on detective's relevant stat)
● • Accessibility modes (color-blind safe, reduced motion, text alternatives)
● • Replayable with different outcomes based on choices/stats
● • Analytics events logged (success_rate, avg_time, fail_reason)
Talking Cat Assistant Implementation
The cat assistant appears as a floating, non-intrusive UI element with these behaviors:
● • Contextual hints: Appears near interactive elements during first-time use
● • Tutorial mode: Step-by-step guided walkthrough for new players
● • Personality engine: Dialogue changes based on player's relationship score with
current character
● • Idle animations: Subtle blinks, tail sways, purring sounds (opt-in)
● • Voice toggle: Optional TTS narration for all cat lines (system-level speech synthesis)
🧪 Phased Delivery Plan (For AI Agent & Engineering Team)
To ensure quality, testability, and incremental value delivery, the project is split into 5
rigorously scoped phases. Each phase delivers shippable, testable functionality with clear
acceptance criteria.
Phase 1: Core Identity & Auth (Duration: 10 days)
● • Implement Supabase Auth with Google, Apple, Email/Password flows
● • Build user profile management (name, avatar, preferences)
● • Create secure JWT middleware for all backend endpoints
● • Deliverable: Working login/signup, profile editing, and auth-protected API access
Phase 2: Character System & Stats Engine (Duration: 12 days)
● • Design and implement PostgreSQL schema for characters, stats, relationships
● • Build CRUD APIs for character selection, stat updates, relationship tracking
● • Implement local SQLite caching in React Native for offline character browsing
● • Deliverable: Fully functional character selection tab with live stats and relationship
matrix
Phase 3: Episode Framework & Save System (Duration: 14 days)
● • Design episode data model and save state schema (JSONB + relational)
● • Implement save/load API with conflict resolution and versioning
● • Build episode list view with season/episode hierarchy and progress tracking
● • Deliverable: Tab 2 (Current Character) fully functional with persistent saves across
app restarts
Phase 4: Mini-Games & Interactive Systems (Duration: 16 days)
● • Implement 3 mini-game types (Hidden Objects, RPS Combat, Interrogation)
● • Integrate dialogue system with branching logic and choice persistence
● • Add talking cat assistant with contextual hints and tutorial mode
● • Deliverable: First playable episode with full gameplay loop and stat impact
Phase 5: Media, Gallery & Polish (Duration: 12 days)
● • Implement S3 upload/download flow with Cloudflare CDN
● • Build gallery tab with video player, photo viewer, favorites manager
● • Add analytics, crash reporting (Sentry), performance monitoring
● • Final QA, accessibility audit, store compliance checks (App Store/Play Store)
● • Deliverable: Production-ready MVP ready for TestFlight/Play Store beta launch
📊 Observability & Monitoring
Production systems require visibility. Implement from Day 1:
● • Frontend: Sentry for crash reporting + custom analytics events (screen_view,
mini_game_start, choice_made, save_success)
● • Backend: Prometheus metrics (request_latency_seconds, http_requests_total,
db_query_duration_seconds) + Grafana dashboards
● • Logs: Structured JSON logs (Logtail) with correlation IDs across
frontend/backend/media services
● • Alerts: PagerDuty/SMS alerts for >5% error rate, >1s p95 latency, DB connection
pool exhaustion
📜 Compliance & Legal
All implementations must adhere to:
● • GDPR/CCPA: Right to access, delete, and port user data (API endpoints
`/api/v1/users/me/data`, `/api/v1/users/me/delete`)
● • Apple App Store Guidelines: SIWA required, no tracking without permission,
privacy manifest
● • Google Play Policy: Data safety section, sensitive permissions justified
● • COPPA: No data collection from users under 13 — age gate required
✅ Next Steps
● 1. Use this README as the single source of truth for AI agent development.
● 2. The backend team should scaffold the Express.js service using the OpenAPI spec
(available at `/openapi.yaml`).
● 3. The mobile team should initialize the React Native project with TypeScript, Redux
Toolkit, and Supabase Auth.
● 4. Begin Phase 1 immediately — auth is foundational and blocks all other work.
● 5. All phases include automated testing (Jest, React Testing Library, Supertest) and
CI/CD pipelines (GitHub Actions).