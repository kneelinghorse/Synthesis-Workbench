# s21-m04 Gate 1 — live Forge regenerate anchor survival

- Date: 2026-06-11T06:01:14.652Z
- Bridge: http://127.0.0.1:4466/run
- Decision: **PASS**

| check | result | detail |
| --- | --- | --- |
| a-node-ids-rendered | PASS | every converted component id is present as data-oods-node-id in the rendered HTML |
| a-labels-rendered | PASS | every composed meta.label reached the DOM as data-oods-label (title, field-0, field-1, Save) |
| b-structural-change | PASS | component count changed 4 -> 6 (the counter-shifting structural change) |
| b-instance-id-reminted | PASS | Forge re-minted the instance id ("form-submit-8" absent from seed B) — the documented fragility |
| b-expected-anchors-match-live | PASS | collectExpectedRegenerateAnchors pairs all present in the live rendered HTML |
| gate1-durable-survives | PASS | entity-slot "title" -> survived (must NOT orphan) |
| gate1-instance-orphans | PASS | instance "form-submit-8" -> orphaned (the m03 finding that motivates decision 119) |

Seed A components: form-title-1, slot-field-0-3, slot-field-1-5, form-submit-8

Seed B components: form-title-1, slot-field-0-3, slot-field-1-5, slot-field-2-7, slot-field-3-9, form-submit-12
