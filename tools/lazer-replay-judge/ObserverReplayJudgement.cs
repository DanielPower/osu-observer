// Plays .osr/.osu pairs from osu-observer through lazer's ReplayPlayer and writes
// every judgement (with the health after it) plus the final score to <replay>.lazer.json.
//
// OBSERVER_REPLAYS: directory of <name>.osr files, each with a <name>.osu beside it.
// An optional <name>.mods.json (lazer mods with settings, as the osu! API returns
// them) replaces the mods in the .osr, which can only hold legacy mods.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using NUnit.Framework;
using osu.Framework.Screens;
using osu.Framework.Testing;
using osu.Game.Beatmaps;
using osu.Game.Beatmaps.Formats;
using osu.Game.IO;
using osu.Game.Online.API;
using osu.Game.Rulesets.Judgements;
using osu.Game.Rulesets.Objects;
using osu.Game.Rulesets.Scoring;
using osu.Game.Scoring;
using osu.Game.Scoring.Legacy;
using osu.Game.Screens.Play;
using osu.Game.Tests.Visual;

namespace osu.Game.Rulesets.Osu.Tests
{
    [HeadlessTest]
    public partial class ObserverReplayJudgement : RateAdjustedBeatmapTestScene
    {
        private static IEnumerable<string> replays()
        {
            string? dir = Environment.GetEnvironmentVariable("OBSERVER_REPLAYS");
            return dir == null ? Array.Empty<string>() : Directory.GetFiles(dir, "*.osr").OrderBy(f => f);
        }

        private static readonly JsonSerializerOptions json_options = new JsonSerializerOptions { WriteIndented = true };

        private ReplayPlayer player = null!;
        private readonly List<JudgementResult> results = new List<JudgementResult>();
        private readonly Dictionary<JudgementResult, double> healthAfter = new Dictionary<JudgementResult, double>();

        [TestCaseSource(nameof(replays))]
        public void Judge(string osrPath)
        {
            Score score = null!;

            AddStep("load beatmap and replay", () =>
            {
                Beatmap beatmap;
                using (var stream = File.OpenRead(Path.ChangeExtension(osrPath, ".osu")))
                using (var reader = new LineBufferedReader(stream))
                    beatmap = Decoder.GetDecoder<Beatmap>(reader).Decode(reader);

                Beatmap.Value = CreateWorkingBeatmap(beatmap);
                Ruleset.Value = new OsuRuleset().RulesetInfo;

                using (var stream = File.OpenRead(osrPath))
                    score = new ReplayDecoder(Beatmap.Value).Parse(stream);

                string modsPath = Path.ChangeExtension(osrPath, ".mods.json");
                if (File.Exists(modsPath))
                {
                    var ruleset = new OsuRuleset();
                    score.ScoreInfo.Mods = Newtonsoft.Json.JsonConvert.DeserializeObject<APIMod[]>(File.ReadAllText(modsPath))!
                                                  .Select(m => m.ToMod(ruleset)).ToArray();
                }
            });

            AddStep("play", () =>
            {
                results.Clear();
                healthAfter.Clear();
                player = new ReplayPlayer(score);
                SelectedMods.Value = score.ScoreInfo.Mods;
                player.OnLoadComplete += _ =>
                {
                    // The health processor applies each result before the score processor does.
                    player.GameplayState.HealthProcessor.NewJudgement += r => healthAfter[r] = player.GameplayState.HealthProcessor.Health.Value;
                    player.GameplayState.ScoreProcessor.NewJudgement += r => results.Add(r);
                };
                LoadScreen(player);
            });

            AddUntilStep("loaded", () => player.IsCurrentScreen());

            // Each step times out after 10s, so long replays are waited on a minute of gameplay at a time.
            for (int minute = 1; minute <= 60; minute++)
            {
                double time = minute * 60000;
                AddUntilStep($"played {minute} min", () => player.GameplayState.HasCompleted || (results.Count > 0 && results[^1].TimeAbsolute >= time));
            }

            AddUntilStep("completed", () => player.GameplayState.HasCompleted);
            AddStep("write results", () => writeResults(osrPath, score));
        }

        private void writeResults(string osrPath, Score score)
        {
            var parents = new Dictionary<HitObject, int>();
            var hitObjects = player.GameplayState.Beatmap.HitObjects;

            for (int i = 0; i < hitObjects.Count; i++)
            {
                foreach (var h in flatten(hitObjects[i]))
                    parents[h] = i;
            }

            var processor = player.GameplayState.ScoreProcessor;
            var healthProcessor = player.GameplayState.HealthProcessor;

            var output = new
            {
                mods = score.ScoreInfo.Mods.Select(m => m.Acronym).ToArray(),
                totalScore = processor.TotalScore.Value,
                accuracy = processor.Accuracy.Value,
                maxCombo = processor.HighestCombo.Value,
                drainRate = (healthProcessor as DrainingHealthProcessor)?.DrainRate,
                judgements = results.Select(r => new
                {
                    objectIndex = parents.TryGetValue(r.HitObject, out int index) ? index : -1,
                    hitObject = r.HitObject.GetType().Name,
                    startTime = r.HitObject.StartTime,
                    time = r.TimeAbsolute,
                    result = r.Type.ToString(),
                    comboAfter = r.ComboAfterJudgement,
                    healthAfter = healthAfter[r],
                }).ToArray(),
            };

            File.WriteAllText(Path.ChangeExtension(osrPath, ".lazer.json"), JsonSerializer.Serialize(output, json_options));
        }

        private static IEnumerable<HitObject> flatten(HitObject hitObject) =>
            new[] { hitObject }.Concat(hitObject.NestedHitObjects.SelectMany(flatten));

        private class ReplayDecoder : LegacyScoreDecoder
        {
            private readonly WorkingBeatmap beatmap;

            public ReplayDecoder(WorkingBeatmap beatmap)
            {
                this.beatmap = beatmap;
            }

            protected override Ruleset GetRuleset(int rulesetId) => new OsuRuleset();
            protected override WorkingBeatmap GetBeatmap(string md5Hash) => beatmap;
        }
    }
}
