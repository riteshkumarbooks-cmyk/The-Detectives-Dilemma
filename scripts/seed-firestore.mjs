// seed-firestore.mjs — Seed clients, seasons, episodes, and NPCs into Firestore
// Run from project root: node scripts/seed-firestore.mjs
//
// Uses firebase-admin with scripts/service-account.json (gitignored).
// Safe to re-run — all writes use .set() which overwrites.
//
// NOTE: No scenes are seeded here. Narrative logic lives in Ink scripts.
//       See assets/stories/*.ink and scripts/compile-ink.mjs.

import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

const serviceAccountPath = resolve(__dirname, 'service-account.json');
if (!existsSync(serviceAccountPath)) {
  console.error('❌  Missing scripts/service-account.json');
  process.exit(1);
}

const admin          = require('firebase-admin');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function main() {
  console.log('Seeding Firestore...\n');

  // ── Client: Duchess Margaux de Valois ──────────────────────────────────────
  await db.doc('clients/duchess-margaux').set({
    name:             'Duchess Margaux de Valois',
    tagline:          'Poise that conceals a storm.',
    description:      'A French duchess of old royalty — elegant, magnetic, and hiding something. She came to you alone, which means she trusts no one at court.',
    avatarUrl:        null,        // S3 TODO
    voiceId:          null,        // ElevenLabs TODO
    order:            1,
    releaseStatus:    'available',
    freeEpisodeCount: 3,
    npcId:            'duchess-margaux',
  });
  console.log('  ✓  client: duchess-margaux');

  // ── Season 1 ───────────────────────────────────────────────────────────────
  await db.doc('clients/duchess-margaux/seasons/season-1').set({
    title:           'Season 1: Shadows of the Valois',
    order:           1,
    unlockCondition: null,
    adsPerEpisode:   5,
    productId:       'com.detectivesdilemma.duchess.s1',
    price:           1.99,
  });
  console.log('  ✓  season: season-1');

  // ── Episodes ───────────────────────────────────────────────────────────────
  const episodes = [
    {
      id: 'ep-1',
      title: 'The First Audience',
      order: 1,
      unlockCondition: null,
      mediaBaseUrl: null,   // S3 TODO: 'https://cdn.example.com/clients/duchess-margaux/seasons/season-1/episodes/ep-1/'
      graphUrl: null,       // Firebase Storage TODO: set to uploaded graph JSON URL when ready
    },
    {
      id: 'ep-2',
      title: 'The Letter',
      order: 2,
      unlockCondition: 'Complete Episode 1',
      mediaBaseUrl: null,
      graphUrl: null,
    },
    {
      id: 'ep-3',
      title: 'Victoria',
      order: 3,
      unlockCondition: 'Complete Episode 2',
      mediaBaseUrl: null,
      graphUrl: null,
    },
  ];

  for (const ep of episodes) {
    const { id, ...data } = ep;
    await db.doc(`clients/duchess-margaux/seasons/season-1/episodes/${id}`).set(data);
    console.log(`  ✓  episode: ${id} — ${data.title}`);
  }

  // ── NPCs ───────────────────────────────────────────────────────────────────
  const npcs = [
    {
      id: 'duchess-margaux',
      data: {
        name:             'Duchess Margaux de Valois',
        role:             'Client',
        description:      'Classy, seductive, charismatic. Early 40s. French royalty.',
        avatarUrl:        null,
        voiceId:          null,
        appearsInClients: ['duchess-margaux'],
        isClient:         true,
        romanceEligible:  true,
        initialValue:     10,
        initialStatus:    'Neutral',
      },
    },
    {
      id: 'victoria-cross',
      data: {
        name:             'Victoria Cross',
        role:             'Person of Interest',
        description:      'Mentioned in the letter. Watching the Duchess. Motives unknown.',
        avatarUrl:        null,
        voiceId:          null,
        appearsInClients: ['duchess-margaux'],
        isClient:         false,
        romanceEligible:  true,
        initialValue:     -10,
        initialStatus:    'Neutral',
      },
    },
    {
      id: 'marcus-webb',
      data: {
        name:             'Marcus Webb',
        role:             'Informant',
        description:      'Street-level contact. Knows things he shouldn\'t.',
        avatarUrl:        null,
        voiceId:          null,
        appearsInClients: ['duchess-margaux'],
        isClient:         false,
        romanceEligible:  false,
        initialValue:     0,
        initialStatus:    'Neutral',
      },
    },
    {
      id: 'commissioner-hayes',
      data: {
        name:             'Commissioner Hayes',
        role:             'Authority',
        description:      'City commissioner. Officially cooperative. Unofficially territorial.',
        avatarUrl:        null,
        voiceId:          null,
        appearsInClients: ['duchess-margaux'],
        isClient:         false,
        romanceEligible:  false,
        initialValue:     0,
        initialStatus:    'Neutral',
      },
    },
    {
      id: 'lady-ashworth',
      data: {
        name:             'Lady Ashworth',
        role:             'Socialite',
        description:      'Moves in the same circles as the Duchess. Friendly on the surface.',
        avatarUrl:        null,
        voiceId:          null,
        appearsInClients: ['duchess-margaux'],
        isClient:         false,
        romanceEligible:  true,
        initialValue:     5,
        initialStatus:    'Neutral',
      },
    },
    {
      id: 'prof-morley',
      data: {
        name:             'Prof. Morley',
        role:             'Expert',
        description:      'Historian specialising in extinct noble bloodlines.',
        avatarUrl:        null,
        voiceId:          null,
        appearsInClients: ['duchess-margaux'],
        isClient:         false,
        romanceEligible:  false,
        initialValue:     5,
        initialStatus:    'Neutral',
      },
    },
  ];

  for (const { id, data } of npcs) {
    await db.doc(`npcs/${id}`).set(data);
    console.log(`  ✓  npc: ${id}`);
  }

  console.log('\n✅  Seed complete.');
  console.log('    Next: node scripts/seed-clues.mjs');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌  Failed:', err.message);
  process.exit(1);
});
