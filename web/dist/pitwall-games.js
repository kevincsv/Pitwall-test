/* Which game each overlay (and Telemetry widget), relative and standings column and header or footer item works with:
   what each game does not send ("lacks") against what each thing needs ("needs"). One table, read by the app
   (index.html: the game badges, the Auto switch per game, the columns offered) and by the agent (gamesupport.go: the
   overlays it opens by itself, the columns it draws). Keep it plain JSON between the braces. */
window.PW_GAMES={
  "games": ["iracing", "lmu"],
  "lacks": {
    "iracing": [],
    "lmu": ["ir", "lic", "inc"],
    "acc": ["ir", "lic", "inc", "names"],
    "ac": ["ir", "lic", "inc", "names", "others"]
  },
  "needs": {
    "widgets": {"radar": ["others"], "relative": ["others"], "standings": ["others", "names"], "gaps": ["others", "names"], "incidents": ["inc"]},
    "columns": {"ir": ["ir"], "irc": ["ir"], "lic": ["lic"], "inc": ["inc"], "laps": ["names"], "last": ["names"], "best": ["names"], "pit": ["names"]},
    "items": {"sof": ["ir"], "irc": ["ir"], "inc": ["inc"]}
  }
};
