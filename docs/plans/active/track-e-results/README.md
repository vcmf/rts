---
status: active
last_reviewed: 2026-10-10
---

# Track E results

Measurements and judgements for `docs/plans/active/track-e-look.md`: the benchmark JSON files from the
min-spec laptop (one per phase run, named by phase, date and build hash), and the judges' answer sheets
and tallies for the readability gate, the terrain ablation and the anti-aliasing A/B.

Proxy runs from the dev Mac are kept too, with `mac-proxy` in the name; they pass no gate.

## Contents

- [`l2a-baseline.md`](l2a-baseline.md): the readability guard and the bench on main before L2b.
- `l2a-2026-10-10-be40f57-mac-proxy.json`: the bench on the dev Mac (Apple M1 Pro, ANGLE Metal), a proxy.
- [`l2b-detail.md`](l2b-detail.md): the detail layer's checks, goldens, guard and bench (L2b).
- `l2b-2026-10-10-0c91f76-mac-proxy.json`: the bench with both arms (the detail layer, the L0 grain) on the
  dev Mac, a proxy.
- `forest-2026-10-13-<build>-<arms>-mac-proxy.json`: the forest bench (`docs/plans/active/forest-bench.md`), the cards
  against the pack crowns (two runs) and the volume light against L7a, where a forest fills the frame; proxies.
  Named by the commit their code is (2241ba9); their `build` field reads `61d031a-dirty`, the working tree before
  that commit.
