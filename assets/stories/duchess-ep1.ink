// The Detective's Dilemma — Duchess Margaux de Valois
// Episode 1: The First Audience
//
// TAG PROTOCOL (read by the React Native engine):
//   # scene: <sceneId>             → S3 asset prefix: mediaBaseUrl + sceneId + '_lipsync.mp4' etc.
//   # type: <image|dialogue|video|choice|minigame|episode_end>
//   # speaker: <npcId>             → NPC whose lip-sync video plays (type: dialogue)
//   # emotion: <neutral|happy|stressed|fearful|angry|suspicious>
//   # clue: <clueId>               → clue granted when player reaches this line
//   # minigame: <type>             → minigame type (type: minigame scenes only)
//   # minigame_config: <json>      → config passed to the mini-game screen
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
-> ep1_search_desk

// ─────────────────────────────────────────────────────────────
// Mini-game demo: search the desk for the letter (hidden objects)
// WIN  → finds the letter → bonus clue
// LOSE → can't find it  → duchess grows frustrated
=== ep1_search_desk ===
# scene: ep1_search_desk
# type: minigame
# minigame: hidden_objects
# minigame_config: {"items":["sealed_letter","crest_sketch","torn_envelope"],"timeLimit":60}
+ [WIN]
    # clue: clue_letter_handwriting
    ~ duchess_trust += 5
    -> ep1_search_success
+ [LOSE]
    ~ duchess_trust -= 5
    -> ep1_search_fail

=== ep1_search_success ===
# scene: ep1_search_success
# type: dialogue
# speaker: duchess-margaux
# emotion: happy
# clue: clue_letter_handwriting
"You found it. The handwriting — do you see the flourish on the V? I know that hand."
-> ep1_end

=== ep1_search_fail ===
# scene: ep1_search_fail
# type: dialogue
# speaker: duchess-margaux
# emotion: stressed
"It doesn't matter. Just find Victoria Cross. The letter is the least of my worries."
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
