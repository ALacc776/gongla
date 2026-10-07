-- Voices default to natural speed (1.0). 0.85 sounded too slow in testing; it is
-- still available as "Learner" in Settings, and 0.7 as "Slow".
alter table profiles alter column speech_rate set default 1.0;
update profiles set speech_rate = 1.0 where speech_rate = 0.85;
