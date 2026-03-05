// seed-scenes.mjs — Seed sample scenes for Episode 1 into Firestore
// Run from project root: node scripts/seed-scenes.mjs
//
// Writes to:
//   clients/duchess-margaux/seasons/season-1/episodes/ep-1/scenes/{sceneId}
//
// Scene graph for "Ep 1 · The First Audience":
//
//   ep1_intro (image)
//       ↓
//   ep1_duchess_speaks (dialogue)
//       ↓
//   ep1_choice_trust (choice)
//       ├─ "Bow formally"    → ep1_after_choice  (relationship: duchess +5)
//       └─ "Smile warmly"    → ep1_after_choice  (relationship: duchess +10)
//       ↓ (converge)
//   ep1_clue_reveal (dialogue)
//       ↓
//   ep1_end (episode_end)

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

// Avoid re-initialising if already done
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const SCENES_PATH =
  'clients/duchess-margaux/seasons/season-1/episodes/ep-1/scenes';

async function write(sceneId, data) {
  await db.doc(`${SCENES_PATH}/${sceneId}`).set(data);
  console.log(`  ✓  ${sceneId}  [${data.type}]`);
}

async function main() {
  console.log('Seeding scenes for Episode 1 — The First Audience...\n');

  // ── Scene 1: Image (entry point, matches episode.startSceneId) ─────────────
  await write('ep1_intro', {
    sceneId:     'ep1_intro',
    type:        'image',
    // S3 TODO: set imageUrl to mediaBaseUrl + 'ep1_intro_bg.jpg' when media is uploaded
    imageUrl:    null,
    nextSceneId: 'ep1_duchess_speaks',
  });

  // ── Scene 2: Dialogue ───────────────────────────────────────────────────────
  await write('ep1_duchess_speaks', {
    sceneId:      'ep1_duchess_speaks',
    type:         'dialogue',
    // S3 TODO: set imageUrl to mediaBaseUrl + 'ep1_duchess_speaks_bg.jpg'
    imageUrl:     null,
    // S3 TODO: set audioUrl to mediaBaseUrl + 'ep1_duchess_speaks_audio.mp3'
    audioUrl:     null,
    speakerNpcId: 'duchess-margaux',
    dialogueText:
      '"Detective. I am glad you came alone. What I am about to tell you ' +
      'must not leave this room. Someone very close to me is not who they claim to be."',
    nextSceneId:  'ep1_choice_trust',
  });

  // ── Scene 3: Choice (branches converge back to ep1_after_choice) ───────────
  await write('ep1_choice_trust', {
    sceneId: 'ep1_choice_trust',
    type:    'choice',
    // S3 TODO: set imageUrl to mediaBaseUrl + 'ep1_choice_trust_bg.jpg'
    imageUrl: null,
    choices: [
      {
        text:        'Bow formally. "You have my complete discretion, Your Grace."',
        nextSceneId: 'ep1_after_choice',
        immediate: {
          relationshipEffects: [{ npcId: 'duchess-margaux', delta: 5 }],
        },
      },
      {
        text:        'Smile warmly. "You can trust me. Tell me everything."',
        nextSceneId: 'ep1_after_choice',
        immediate: {
          relationshipEffects: [{ npcId: 'duchess-margaux', delta: 10 }],
        },
      },
    ],
  });

  // ── Scene 4: Dialogue (convergence point after choice) ─────────────────────
  await write('ep1_after_choice', {
    sceneId:      'ep1_after_choice',
    type:         'dialogue',
    imageUrl:     null,
    audioUrl:     null,
    speakerNpcId: 'duchess-margaux',
    dialogueText:
      '"Three nights ago, a letter arrived — sealed with a crest that has been ' +
      'extinct for two centuries. Someone is playing a very dangerous game."',
    nextSceneId: 'ep1_clue_reveal',
  });

  // ── Scene 5: Dialogue (clue granted) ───────────────────────────────────────
  await write('ep1_clue_reveal', {
    sceneId:      'ep1_clue_reveal',
    type:         'dialogue',
    imageUrl:     null,
    audioUrl:     null,
    speakerNpcId: 'duchess-margaux',
    dialogueText:
      '"The letter mentioned a name — Victoria Cross. I want you to find out ' +
      'what she knows, and why she is watching me."',
    nextSceneId: 'ep1_end',
    // Immediate effect: clue granted when player reaches this scene
    immediate: {
      clueGrant: ['clue_victoria_cross_connection'],
      relationshipEffects: [{ npcId: 'victoria-cross', delta: -10 }],
    },
  });

  // ── Scene 6: Episode end ────────────────────────────────────────────────────
  await write('ep1_end', {
    sceneId: 'ep1_end',
    type:    'episode_end',
    // Triggers in engine: save progress, increment episodesPlayedCount,
    // apply pending deferred effects, check entitlement for next episode
  });

  console.log('\n✅  6 scenes written for Episode 1.');
  console.log('    startSceneId on ep-1 doc is already set to: ep1_intro');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌  Failed:', err.message);
  process.exit(1);
});
