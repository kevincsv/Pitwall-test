"""Builds web/dist/demo-series.json: a real iRacing season (2026 S1, captured
Data API responses) with dates moved forward whole weeks so the sample lines up
with the current season. Used only when no iRacing account is connected."""
import json, sys, datetime as dt
SRC = sys.argv[1]; OUT = sys.argv[2]; SHIFT = dt.timedelta(days=int(sys.argv[3]) if len(sys.argv) > 3 else 273)
def sd(s):  # date or datetime string -> shifted, same format
    if s is None: return None
    if len(s) == 10: return (dt.date.fromisoformat(s) + SHIFT).isoformat()
    z = s.endswith("Z"); d = dt.datetime.fromisoformat(s.replace("Z", "+00:00")) + SHIFT
    return d.strftime("%Y-%m-%dT%H:%M:%S") + ("Z" if z else "")
seasons = json.load(open(f"{SRC}/series.seasons.json"))
tracks = {t["track_id"]: t for t in json.load(open(f"{SRC}/track.get.json"))}
cars = {c["car_id"]: c for c in json.load(open(f"{SRC}/car.get.json"))}
classes = {c["car_class_id"]: [x["car_id"] for x in c["cars_in_class"]] for c in json.load(open(f"{SRC}/carclass.get.json"))}
out_s, used_t, used_c = [], set(), set()
for s in seasons:
    if (s["season_year"], s["season_quarter"]) != (2026, 1): continue
    cls_cars = [cid for cc in s.get("car_class_ids") or [] for cid in classes.get(cc, [])]
    used_c.update(cls_cars)
    weeks = []
    for w in s["schedules"]:
        r = (w.get("race_time_descriptors") or [{}])[0]
        wx = (w.get("weather") or {}).get("weather_summary") or {}
        tid = w["track"]["track_id"]; used_t.add(tid)
        cl = [c["car_id"] for c in w.get("race_week_cars") or []]; used_c.update(cl)
        weeks.append({"w": w["race_week_num"], "s": sd(w["start_date"]), "e": sd(w.get("week_end_time")), "cat": w.get("category"),
            "tr": tid, "cars": cl, "laps": w.get("race_lap_limit"), "mins": w.get("race_time_limit"),
            "rtd": {"r": r.get("repeating", False), "f": r.get("first_session_time"), "m": r.get("repeat_minutes"), "d": r.get("day_offset"),
                    "sd": sd(r.get("start_date")), "t": [sd(x) for x in r.get("session_times") or []], "sl": r.get("session_minutes")},
            "wx": {"hi": wx.get("temp_high"), "lo": wx.get("temp_low"), "u": wx.get("temp_units"), "rain": wx.get("precip_chance")}})
    out_s.append({"id": s["season_id"], "sid": s["series_id"], "name": s["schedules"][0]["series_name"].strip(), "lic": s["license_group"],
        "fixed": s["fixed_setup"], "official": s["official"], "multi": s["multiclass"], "desc": s.get("schedule_description"),
        "cc": cls_cars, "maxW": s.get("max_weeks"), "drops": s.get("drops"), "inc": s.get("incident_limit"), "weeks": weeks})
T = {i: [tracks[i]["track_name"], tracks[i].get("config_name") or "", tracks[i]["package_id"], tracks[i]["free_with_subscription"], tracks[i].get("price", 0)] for i in used_t if i in tracks}
C = {i: [cars[i]["car_name"], cars[i]["car_name_abbreviated"], cars[i]["package_id"], cars[i]["free_with_subscription"]] for i in used_c if i in cars}
# Sample member: free content plus a typical set of purchases.
buy_t = ["Road America", "Watkins Glen International", "Spa-Francorchamps", "Brands Hatch Circuit", "Daytona International Speedway", "Sebring International Raceway", "Mount Panorama Circuit"]
buy_c = ["Porsche 911 GT3 Cup (992)", "Ferrari 296 GT3", "Ray FF1600"]
tp = sorted({v[2] for v in T.values() if any(b in v[0] for b in buy_t)}); cp = sorted({v[2] for v in C.values() if v[0] in buy_c})
member = {"cust_id": 0, "display_name": "Kevin C.", "track_packages": [{"package_id": p} for p in tp], "car_packages": [{"package_id": p} for p in cp],
  "licenses": {
    "oval": {"category_id": 1, "category": "oval", "group_id": 2, "group_name": "Class D", "safety_rating": 2.71, "irating": 1312, "cpi": 18.2, "license_level": 7, "color": "fc8a27"},
    "sports_car": {"category_id": 5, "category": "sports_car", "group_id": 4, "group_name": "Class B", "safety_rating": 3.41, "irating": 2214, "cpi": 31.4, "license_level": 16, "color": "33a12f"},
    "formula_car": {"category_id": 6, "category": "formula_car", "group_id": 3, "group_name": "Class C", "safety_rating": 2.95, "irating": 1688, "cpi": 24.0, "license_level": 11, "color": "feec04"},
    "dirt_oval": {"category_id": 3, "category": "dirt_oval", "group_id": 1, "group_name": "Rookie", "safety_rating": 2.5, "irating": 1350, "cpi": 10.1, "license_level": 2, "color": "fc0706"},
    "dirt_road": {"category_id": 4, "category": "dirt_road", "group_id": 1, "group_name": "Rookie", "safety_rating": 3.12, "irating": 1350, "cpi": 12.6, "license_level": 3, "color": "fc0706"}}}
json.dump({"note": "Sample: 2026 Season 1 schedule shifted to current dates", "seasons": out_s, "tracks": T, "cars": C, "member": member},
          open(OUT, "w"), separators=(",", ":"), ensure_ascii=False)
print(len(out_s), "seasons", len(T), "tracks", len(C), "cars")
