// minigameResult.ts — Simple singleton to pass win/lose result back to episode player
//
// Flow:
//   1. episode.tsx detects # type: minigame tag → navigates to /(main)/minigame
//   2. minigame.tsx completes → calls setMinigameResult('win' | 'lose') → router.back()
//   3. episode.tsx regains focus → useFocusEffect calls consumeMinigameResult()
//   4. episode advances story: ChooseChoiceIndex(0) = win, ChooseChoiceIndex(1) = lose

let _result: 'win' | 'lose' | null = null;

export function setMinigameResult(result: 'win' | 'lose'): void {
  _result = result;
}

/** Reads and clears the result. Returns null if no mini-game has completed. */
export function consumeMinigameResult(): 'win' | 'lose' | null {
  const r = _result;
  _result = null;
  return r;
}
