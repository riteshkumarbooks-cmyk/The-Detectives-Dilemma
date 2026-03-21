export type VarEffects = Record<string, number>;

export type ChoiceOption = {
  text:     string;
  next:     string;
  effects?: VarEffects;
  clues?:   string[];
};

export type VideoScene = {
  type?:    'video';           // default when no type field
  videoUrl: string | null;
  clues?:   string[];
  effects?: VarEffects;
  choices?: ChoiceOption[];   // if present: show overlay after video (or immediately if no video)
  next?:    string;            // used when no choices
};

// Static background image + optional narration text — tap anywhere to advance
export type ImageScene = {
  type:      'image';
  imageUrl:  string | null;   // null = dark bg during dev
  text?:     string;          // narration/caption shown over image
  audioUrl?: string | null;   // optional voice-over mp3
  clues?:    string[];
  effects?:  VarEffects;
  next:      string;
};

// NPC dialogue — lip-sync video (or still) + speaker name + subtitle text — tap to advance
export type DialogueScene = {
  type:      'dialogue';
  videoUrl?: string | null;   // lip-sync video; null = show portrait still
  imageUrl?: string | null;   // portrait fallback when no video
  speaker:   string;          // NPC display name
  text:      string;          // subtitle / dialogue line
  audioUrl?: string | null;   // voice line mp3
  clues?:    string[];
  effects?:  VarEffects;
  choices?:  ChoiceOption[];  // if present: show choices after dialogue; else tap advances to next
  next?:     string;
};

export type MinigameScene = {
  type:             'minigame';
  minigameType:     string;
  minigameConfig?:  Record<string, unknown>;
  clueOnWin?:       string;
  effectOnWin?:     VarEffects;
  effectOnLose?:    VarEffects;
  onWin:            string;
  onLose:           string;
};

export type EpisodeEndScene = {
  type: 'episode_end';
};

export type SceneNode = VideoScene | ImageScene | DialogueScene | MinigameScene | EpisodeEndScene;

export type EpisodeGraph = {
  version:    number;
  startScene: string;
  scenes:     Record<string, SceneNode>;
};

export type EpisodeState = {
  currentSceneId: string;
  variables:      Record<string, number>;
  cluesFound:     string[];
  choicesMade:    Record<string, { text: string; next: string; ts: number }>;
};
