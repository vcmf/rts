// The look page's battles by name and figure budget (docs/plans/active/division-armies.md, decision 0099): data only,
// read by the page's switches and panel at load (src/look/world/battle-url.ts) without the scenario, its ruleset or the
// sim (src/scenarios/armies-demo.ts holds each battle's corps, loaded with the armies)

/** each battle's figures, both sides: a typical one for the look (about 6,000, two infantry corps a side) and
 *  the stress tests at 16,000 and 32,000 (the owner, 2026-10-31) */
export const BATTLE_BUDGETS: Readonly<Record<string, number>> = { typical: 6400, '16k': 16000, '32k': 32000 }
/** each battle's figures as fielded, both sides (its corps cut at the budget: src/look/world/battle.ts orderOfBattle;
 *  test/battle.test.ts checks them): the panel's labels */
export const BATTLE_FIGURES: Readonly<Record<string, number>> = { typical: 6272, '16k': 16000, '32k': 32000 }
/** the battle of a bare ?battle */
export const DEFAULT_BATTLE = '16k'
/** the old page's battalion (decision 0018's 414 figures), by which ?armies=<n> maps onto the battle nearest its
 *  figures */
export const LEGACY_BATTALION = 414
