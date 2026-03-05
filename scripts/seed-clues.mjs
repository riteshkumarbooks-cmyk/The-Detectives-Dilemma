// seed-clues.mjs — Seed the top-level `clues/` collection in Firestore
// Run from project root: node scripts/seed-clues.mjs
//
// Clues referenced in Episode 1 "The First Audience":
//   - clue_victoria_cross_connection  (granted at ep1_clue_reveal)
//   - clue_extinct_crest              (granted at ep1_clue_reveal_trusted — high trust path only)

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

async function write(clueId, data) {
  await db.doc(`clues/${clueId}`).set(data);
  console.log(`  ✓  ${clueId}  [${data.type}]  importance: ${data.importance}`);
}

async function main() {
  console.log('Seeding clues collection...\n');

  await write('clue_victoria_cross_connection', {
    title:       'Victoria Cross Connection',
    description:
      'The Duchess received a letter sealed with a crest extinct for two centuries. ' +
      'She named Victoria Cross as the sender and believes Victoria has been watching her.',
    type:        'testimony',
    clientId:    'duchess-margaux',
    episodeId:   'ep-1',
    imageUrl:    null,
    importance:  'critical',
    revealedBy:  'ep1_clue_reveal',
  });

  await write('clue_extinct_crest', {
    title:       'The Extinct Crest',
    description:
      'The wax seal on the letter bears a crest belonging to a bloodline wiped out ' +
      'two centuries ago. Someone is using it deliberately — or IS that bloodline.',
    type:        'physical',
    clientId:    'duchess-margaux',
    episodeId:   'ep-1',
    imageUrl:    null,
    importance:  'critical',
    revealedBy:  'ep1_clue_reveal_trusted',   // only on high-trust path
  });

  console.log('\n✅  2 clues written.');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌  Failed:', err.message);
  process.exit(1);
});
