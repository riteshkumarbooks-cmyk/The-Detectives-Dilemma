// The Detective's Dilemma — Duchess Margaux de Valois
// Episode 1: The First Audience
//
// TAG PROTOCOL (read by the React Native engine):
//   # scene: <sceneId>         → S3 asset prefix for bg/video/audio
//   # type: <image|dialogue|choice|episode_end>
//   # speaker: <npcId>         → NPC whose lip-sync video plays
//   # emotion: <neutral|happy|stressed|fearful|angry|suspicious>
//   # clue: <clueId>           → granted when player reaches this line
//
// VARIABLES map directly to Firestore:
//   duchess_trust            → relationships[duchess-margaux].value
//   victoria_suspicion       → relationships[victoria-cross].value
//   clue_victoria_found      → progress[duchess-margaux].cluesFound

VAR duchess_trust = 50
VAR victoria_suspicion = -10
VAR clue_victoria_found = false

-> ep1_intro

// ─────────────────────────────────────────────────────────────
=== ep1_intro ===
# scene: ep1_intro
# type: image
The detective steps into the grand hall of the de Valois estate.
The scent of old roses and candle wax fills the air.
-> ep1_duchess_speaks

// ─────────────────────────────────────────────────────────────
=== ep1_duchess_speaks ===
# scene: ep1_duchess_speaks
# type: dialogue
# speaker: duchess-margaux
# emotion: neutral
"Detective. I am glad you came alone. What I am about to tell you must not leave this room. Someone very close to me is not who they claim to be."
-> ep1_choice_trust

// ─────────────────────────────────────────────────────────────
=== ep1_choice_trust ===
# scene: ep1_choice_trust
# type: choice
What do you do?

+ [Bow formally. "You have my complete discretion, Your Grace."]
    ~ duchess_trust += 5
    -> ep1_after_choice

+ [Smile warmly. "You can trust me. Tell me everything."]
    ~ duchess_trust += 10
    -> ep1_after_choice

+ [Stay silent. Let her continue.]
    -> ep1_after_choice

// ─────────────────────────────────────────────────────────────
=== ep1_after_choice ===
# scene: ep1_after_choice
# type: dialogue
# speaker: duchess-margaux
# emotion: stressed
"Three nights ago, a letter arrived — sealed with a crest that has been extinct for two centuries. Someone is playing a very dangerous game."

    // Branch based on trust level built so far
    { duchess_trust >= 60:
        -> ep1_clue_reveal_trusted
    - else:
        -> ep1_clue_reveal
    }

// ─────────────────────────────────────────────────────────────
=== ep1_clue_reveal ===
# scene: ep1_clue_reveal
# type: dialogue
# speaker: duchess-margaux
# emotion: fearful
# clue: clue_victoria_cross_connection
"The letter mentioned a name — Victoria Cross. Find out what she knows."
~ clue_victoria_found = true
~ victoria_suspicion -= 10
-> ep1_end

// ─────────────────────────────────────────────────────────────
=== ep1_clue_reveal_trusted ===
# scene: ep1_clue_reveal_trusted
# type: dialogue
# speaker: duchess-margaux
# emotion: suspicious
# clue: clue_victoria_cross_connection
# clue: clue_extinct_crest
"The letter mentioned a name — Victoria Cross. And the crest... it belongs to a bloodline that was supposedly wiped out. Find her. Find the truth."
~ clue_victoria_found = true
~ victoria_suspicion -= 20
-> ep1_end

// ─────────────────────────────────────────────────────────────
=== ep1_end ===
# scene: ep1_end
# type: episode_end
-> END
