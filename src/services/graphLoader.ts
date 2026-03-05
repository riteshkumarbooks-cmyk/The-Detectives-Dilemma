import { EpisodeGraph } from '@/types/episode';

// Bundled fallbacks (offline / dev — no graphUrl yet)
const BUNDLED: Record<string, EpisodeGraph> = {
  'duchess-margaux/ep-1': require('../../assets/episodes/duchess-ep1-graph.json'),
};

/**
 * Load episode graph:
 *   1. If Firestore episode doc has graphUrl → fetch from Firebase Storage
 *   2. Fall back to bundled JSON
 */
export async function loadEpisodeGraph(
  clientId:  string,
  episodeId: string,
  graphUrl:  string | null,
): Promise<EpisodeGraph | null> {
  const key = `${clientId}/${episodeId}`;

  if (graphUrl) {
    try {
      const res = await fetch(graphUrl);
      if (res.ok) {
        const remote = await res.json() as EpisodeGraph;
        if (typeof remote.version === 'number' && remote.startScene && remote.scenes) {
          return remote;
        }
      }
    } catch (_) {
      // Non-fatal: fall through to bundled
    }
  }

  return BUNDLED[key] ?? null;
}
