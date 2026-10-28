-- Le Mans Ultimate's class boards and the wet badge (lmuclass.js). cls: the lap's LMU class (Hypercar, LMP2, LMP3, LMGTE,
-- LMGT3), sent by the PC, else from the car's name; NULL for iRacing and for an LMU car nobody knows. wet: 2 the lap was
-- driven on a wet track, 1 on a damp one, NULL dry (from the trace's flags when it was shared; the laps of before are NULL).
ALTER TABLE community_laps ADD COLUMN cls TEXT;
ALTER TABLE community_laps ADD COLUMN wet INTEGER;
-- the laps of before take their class from the car's name (the same rules as lmuClass's BY_CAR)
UPDATE community_laps SET cls = CASE
    WHEN car LIKE '%GT3%' THEN 'LMGT3'
    WHEN car LIKE '%GTE%' OR car LIKE '%RSR%' OR car LIKE '%C8.R%' OR car LIKE '%Vantage AMR%' THEN 'LMGTE'
    WHEN car LIKE '%499P%' OR car LIKE '%963%' OR car LIKE '%GR010%' OR car LIKE '%9X8%' OR car LIKE '%V-Series.R%' OR car LIKE '%M Hybrid%'
      OR car LIKE '%A424%' OR car LIKE '%SC63%' OR car LIKE '%SCG 007%' OR car LIKE '%SCG007%' OR car LIKE '%Vanwall%' OR car LIKE '%Vandervell%' OR car LIKE '%Isotta%' OR car LIKE '%Tipo6%'
      OR car LIKE '%Tipo 6%' OR car LIKE '%Valkyrie%' OR car LIKE '%Hypercar%' OR car LIKE '%LMDh%' OR car LIKE '%LMH%' THEN 'Hypercar'
    WHEN car LIKE '%Oreca%' OR car LIKE '%LMP2%' THEN 'LMP2'
    WHEN car LIKE '%Ligier%' OR car LIKE '%Ginetta%' OR car LIKE '%Duqueine%' OR car LIKE '%LMP3%' THEN 'LMP3'
  END
  WHERE game = 'lmu';
-- a class board: each driver's best lap of the class at the track (GET /laps?cls=)
CREATE INDEX IF NOT EXISTS community_laps_cls ON community_laps(game, track_id, cls, time);
