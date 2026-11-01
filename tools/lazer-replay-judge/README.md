# lazer-replay-judge

Plays replays through osu!lazer's own `ReplayPlayer`, headless, and records
lazer's judgements. The simulator's tests (`packages/osu-simulation/src/simulation.test.ts`)
use these results as their expected values, so the expectations come from the
game, not from our reading of its code. They run every replay in
`test/data/replays` (real lazer scores) and `test/data/scenarios` (generated
replays that exercise specific rules).

## Usage

1. Clone [ppy/osu](https://github.com/ppy/osu) (the current results came from
   commit `fe16a2c`) and install the .NET SDK version
   in its `global.json`.
2. Copy `ObserverReplayJudgement.cs` into `osu.Game.Rulesets.Osu.Tests/`.
3. Point `OBSERVER_REPLAYS` at a directory of `<name>.osr` files, each with a
   matching `<name>.osu`, and run:

   ```sh
   OBSERVER_REPLAYS=/path/to/osu-observer/packages/osu-simulation/test/data/scenarios \
     dotnet test osu.Game.Rulesets.Osu.Tests --filter "FullyQualifiedName~ObserverReplayJudgement"
   ```

A replay can have a `<name>.mods.json` beside it: the score's lazer mods with
their settings, in the osu! API's format (`[{"acronym": "DT", "settings": {"speed_change": 1.2}}]`).
The harness plays the replay with those mods instead of the ones in the `.osr`,
which can only hold legacy mods, and the simulator's tests use the same file.

Each replay gets a `<name>.lazer.json` beside it with every judgement (including
slider ticks, tails and spinner bonus) and the health after it, lazer's total score,
accuracy, max combo and health drain rate.

## Adding a real replay

Put the `.osr` and its beatmap's `.osu` in `packages/osu-simulation/test/data/replays`
under the same name, plus a `.mods.json` if the score has mods. Run the harness on
that directory and commit the files.

## Adding a scenario

1. Add it to `packages/osu-simulation/test/scenarios/scenarios.ts`.
2. Run `pnpm --filter osu-simulation generate-scenarios` to write its `.osu` and `.osr`.
3. Run the harness above to record `<name>.lazer.json`, and commit all three files.

The replays are ordinary lazer `.osr` files, so they can also be watched in the
game by importing the `.osu` (as a beatmap) and then the `.osr`.
