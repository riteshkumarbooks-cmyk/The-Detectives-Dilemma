// localAssets.ts — Static require() map for local dev scene assets
//
// Metro bundler resolves require() at build time, so all local media must be
// listed here explicitly. These files are gitignored (images/video/audio under
// assets/clients/) — drop files locally, never commit them.
//
// Key format: '{clientId}/{seasonId}/{episodeId}/{sceneId}'
// Value: number (the require() result used as an Image/Video source)
//
// When an imageUrl / videoUrl is set on the Firestore episode doc (CDN URL),
// this map is bypassed entirely — production uses the CDN URL.

const LOCAL_SCENE_ASSETS: Record<string, number> = {
  // duchess-margaux — Season 1 — Episode 1
  'duchess-margaux/season-1/ep-1/ep1_intro': require('../../assets/clients/duchess-margaux/seasons/season-1/episodes/ep-1/videos/scene1.png'),
};

/**
 * Returns a local require() asset for a scene, or null if not registered.
 * Use as: <Image source={resolveLocalSceneAsset(...)} />
 */
export function resolveLocalSceneAsset(
  clientId:  string,
  seasonId:  string,
  episodeId: string,
  sceneId:   string,
): number | null {
  return LOCAL_SCENE_ASSETS[`${clientId}/${seasonId}/${episodeId}/${sceneId}`] ?? null;
}
