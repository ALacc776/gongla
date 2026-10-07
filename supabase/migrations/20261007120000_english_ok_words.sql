-- Words the learner is fine saying in English. The chat never makes a "Say it like
-- this" card for these. Edited in Settings; starts with a few everyday ones.
alter table profiles add column english_ok text[] not null default '{ok,sorry,check,bye}';

grant update (english_ok) on profiles to authenticated;
