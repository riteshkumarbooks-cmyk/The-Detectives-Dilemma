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

export type SceneNode = VideoScene | MinigameScene | EpisodeEndScene;

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
