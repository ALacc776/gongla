-- Milestone 1: the first built-in scenario (docs/design.md F7).
insert into scenarios (id, owner_id, pack, spec, is_custom)
values (
  '00000000-0000-4000-8000-000000000001',
  null,
  'food',
  '{
    "title": "Ordering at a cha chaan teng",
    "setting": "A busy Hong Kong diner at lunchtime.",
    "character": {
      "name": "Auntie Wai",
      "role": "waitress",
      "personality": "fast, blunt, secretly kind",
      "speech_style": "short sentences, lots of 啦 and 喎"
    },
    "user_role": "a customer",
    "goal": "Order a meal and a drink, then ask for the bill.",
    "beats": ["greet and seat", "take order", "upsell a drink", "bring bill"],
    "difficulty": 2,
    "key_phrases": ["唔該", "埋單", "凍檸茶", "走冰"],
    "opener_hint": "Auntie asks how many people, impatiently."
  }'::jsonb,
  false
)
on conflict (id) do nothing;
