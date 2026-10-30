// node cloud/test/season-import.test.mjs: iRacing's season schedule (the PDF's text) becomes the season the planner
// reads: series under the contents' category, weeks with tracks and lengths, cars, and race times as a repeating
// pattern or as set times in GMT (or New York time).
import assert from "node:assert/strict";
import { parseSchedule, parseRaceTimes, seriesName, splitTrack, nameId } from "../../tools/season-import.mjs";

// race times, in the ways the schedule writes them
const rep = (s) => { const r = parseRaceTimes(s); return r && r.repeating ? `${r.first_session_time}/${r.repeat_minutes}` : r; };
assert.equal(rep("Races every 30 minutes at :15 and :45"), "00:15:00/30");
assert.equal(rep("Races every 30 minutes"), "00:00:00/30");
assert.equal(rep("Races at 15 past every 2 hours"), "00:15:00/120");
assert.equal(rep("Races 45 past every 2 hours"), "00:45:00/120");
assert.equal(rep("Races every 2 hours at the :30"), "00:30:00/120");
assert.equal(rep("Races every odd 2 hours on the hour"), "01:00:00/120");
assert.equal(rep("Races every even 2 hours at :30 past"), "00:30:00/120");
assert.equal(rep("Races hourly at the top of the hour"), "00:00:00/60");
assert.equal(rep("Races every hour at half past"), "00:30:00/60");
assert.equal(rep("Races at :15 and :45"), "00:15:00/30");
assert.equal(rep("Races every 30 minutes at :00 & 30"), "00:00:00/30");
assert.equal(rep("Races every thirty minutes on the hour and :30 past"), "00:00:00/30");
assert.equal(rep("Every hour on the :30"), "00:30:00/60");
assert.equal(rep("Races on every hour on the hour | Qualifying every hour at :30"), "00:00:00/60");
assert.equal(rep("Open Qualifier every hour at :15 after - Race every hour at :45 after"), "00:45:00/60");
assert.equal(parseRaceTimes("4 Timeslots Per Week"), null);
assert.deepEqual(parseRaceTimes("Races Fri & Sun at 10, 19 GMT & Sat & Mon at 1, 4 GMT").slots.map((s) => `${s.day}@${s.h}`), ["5@10", "5@19", "0@10", "0@19", "6@1", "6@4", "1@1", "1@4"]);
assert.deepEqual(parseRaceTimes("Races on Saturday at 7 & 17:00 GMT & Sunday at 0 & 13 GMT").slots.map((s) => `${s.day}@${s.h}`), ["6@7", "6@17", "0@0", "0@13"]);
assert.deepEqual(parseRaceTimes("Races on Thursday at 8pm ET").slots, [{ day: 4, h: 20, m: 0, tz: "ET" }]);

// names
assert.equal(seriesName("Mini Stock Rookie Series by Thrustmaster - 2026 Season 4"), "Mini Stock Rookie Series by Thrustmaster");
assert.equal(seriesName("NASCAR Class A Series - Fixed - 2026 Season 4 Fixed"), "NASCAR Class A Series - Fixed");
assert.deepEqual(splitTrack("Charlotte Motor Speedway - Oval"), ["Charlotte Motor Speedway", "Oval"]);
assert.deepEqual(splitTrack("Iowa Speedway - Oval - 2011 - Oval - 2011"), ["Iowa Speedway", "Oval - 2011"]);
assert.equal(nameId("series:GT3"), nameId("series:gt3 "), "ids do not change with case or spaces");

// a small schedule: the contents, then a page whose heading is a page late (the series is a formula series)
const text = [
  "Current iRacing Race Schedule",
  "OVAL . . . . . . . . . .",
  "R Class Series (OVAL) . . . . . . .",
  "Mini Stock Rookie Series - 2026 Season 4 . . . . . .",
  "FORMULA CAR . . . . . . . . . .",
  "C Class Series (FORMULA CAR) . . . . . . .",
  "Formula A - Grand Prix Tour - Fixed - 2026 Season 4 . . . . . .",
  "DIRT OVAL . . . . . . . . . .",
  "A Class Series (DIRT OVAL) . . . . . . .",
  "World of Outlaws Pro Qualifying Series - 2026 Season - Lates . . . .",
  "5",
  "",
  "OVAL",
  "R Class Series (OVAL)",
  "Mini Stock Rookie Series - 2026 Season 4",
  "Mini Stock",
  "Rookie 1.0 --> Pro/WC 4.0",
  "Races every 30 minutes at :15 and :45",
  "Min entries for official: 6 | Split at: 14 | Drops: 4",
  "No incident DT penalties. DQ at 17 incidents.",
  "Week 1 (2026-09-15) Charlotte Motor Speedway - Oval",
  "(2026-09-19 13:40 1x)",
  "84°F/29°C, All dry events, Rolling start,",
  "15 laps",
  "Week 2 (2026-09-22) Hockenheimring Baden-Württemberg - Grand",
  "Prix",
  "(2026-09-26 13:05 1x)",
  "80°F/27°C, Rain chance 36%, Rolling start,",
  "120",
  "mins",
  "6",
  "",
  "DIRT OVAL",
  "R Class Series (DIRT OVAL)",
  "Formula A - Grand Prix Tour - Fixed - 2026 Season 4",
  "Mercedes\x02AMG W13 E Performance, NASCAR Legends Pontiac Grand Prix -",
  "1987",
  "Class C 4.0 --> Pro/WC 4.0",
  "Races Fri & Sun at 10, 19 GMT & Sat & Mon at 1, 4 GMT",
  "Min entries for official: 6 | Split at: 24 | Drops: 4",
  "Week 1 (2026-09-15) Barber Motorsports Park",
  "(2026-09-19 12:00 1x)",
  "77°F/25°C, All dry events, Grid by class, Standing start",
  "35 laps",
  "World of Outlaws Pro Qualifying Series - 2026 Season - Lates",
  "Dirt Late Model - Super",
  "Class A 1.0 --> Pro/WC 4.0",
  "Races on Thursday at 8pm ET",
  "Min entries for official: 6 | Split at: 22 | Drops: 1",
  "Week 1 (2026-10-23) Oswego Speedway - Dirt",
  "(2026-10-24 13:05 1x)",
  "40 laps",
  "Week 2 (2026-11-06) Knoxville Raceway",
  "(2026-11-07 13:30 1x)",
  "40 laps",
].join("\r\n");

const { season, problems } = parseSchedule(text);
assert.deepEqual(problems, []);
assert.equal(season.seasons.length, 3);
const [mini, fa, woo] = season.seasons;

assert.equal(mini.series_name, "Mini Stock Rookie Series");
assert.equal(mini.license_group, 1);
assert.equal(mini.drops, 4);
assert.equal(mini.incident_limit, 17);
assert.equal(mini.schedules.length, 2);
const [w1, w2] = mini.schedules;
assert.equal(w1.category, "oval");
assert.equal(w1.race_week_num, 0);
assert.equal(w1.race_lap_limit, 15);
assert.deepEqual(w1.track, { track_id: w1.track.track_id, track_name: "Charlotte Motor Speedway", config_name: "Oval" });
assert.deepEqual(w1.race_time_descriptors[0], { repeating: true, first_session_time: "00:15:00", repeat_minutes: 30, start_date: "2026-09-15" });
assert.equal(w1.week_end_time, "2026-09-22T00:00:00Z");
assert.equal(w1.weather.weather_summary.temp_high, 84);
assert.equal(w2.track.config_name, "Grand Prix", "a track name broken over two lines");
assert.equal(w2.race_time_limit, 120, "a length broken over two lines");
assert.equal(w2.weather.weather_summary.precip_chance, 36);

assert.equal(fa.series_name, "Formula A - Grand Prix Tour - Fixed");
assert.equal(fa.schedules[0].category, "formula_car", "the category comes from the contents, not the late page heading");
assert.equal(fa.license_group, 3);
assert.ok(fa.fixed_setup && fa.multiclass);
const cars = season.classes.find((c) => c.car_class_id === fa.car_class_ids[0]).cars_in_class.map((c) => season.cars.find((x) => x.car_id === c.car_id).car_name);
assert.deepEqual(cars, ["Mercedes-AMG W13 E Performance", "NASCAR Legends Pontiac Grand Prix - 1987"]);
// Tue 15 to Tue 22 September: Fri 18 at 10 and 19, Sat 19 at 1 and 4, Sun 20 at 10 and 19, Mon 21 at 1 and 4 (GMT)
assert.deepEqual(fa.schedules[0].race_time_descriptors[0].session_times, [
  "2026-09-18T10:00:00Z", "2026-09-18T19:00:00Z", "2026-09-19T01:00:00Z", "2026-09-19T04:00:00Z",
  "2026-09-20T10:00:00Z", "2026-09-20T19:00:00Z", "2026-09-21T01:00:00Z", "2026-09-21T04:00:00Z",
]);

// Thursday 8pm in New York: midnight GMT in summer time, 1am after the clocks change (1 November 2026)
assert.equal(woo.schedules[0].category, "dirt_oval");
assert.equal(woo.license_group, 5);
assert.deepEqual(woo.schedules[0].race_time_descriptors[0].session_times, ["2026-10-23T00:00:00Z", "2026-10-30T00:00:00Z"]);
assert.equal(woo.schedules[1].race_time_descriptors[0].session_times[0], "2026-11-06T01:00:00Z");

// what the server stores and the planner reads
assert.ok(Array.isArray(season.seasons) && Array.isArray(season.tracks) && Array.isArray(season.cars) && Array.isArray(season.classes));
assert.ok(JSON.stringify({ season }).length > 100);
console.log("season import: ok");
