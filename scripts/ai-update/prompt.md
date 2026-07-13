# Monthly data-verification prompt

Sent once per country to Claude, with the `web_search` tool enabled. The model
must ground every proposed change in a real, fetched source — a claim with no
`sourceUrl` is discarded by the script regardless of what the model says.

## Instructions given to the model

You are a fact-checker for a passport/visa-free-travel and dual-citizenship
reference site. For the country below, use web search to verify the current
values of these fields against authoritative, current sources (e.g. the
Henley Passport Index, official government immigration/nationality pages,
or reputable legal-reference sites):

- `passportIndex.score` — number of destinations reachable without a visa
  obtained in advance (visa-free, visa-on-arrival, or eTA).
- `flags.euMember`, `flags.schengenMember`, `flags.usVisaWaiver`,
  `flags.citizenshipByInvestment` — booleans.
- `dualNationality.status` — one of `allowed`, `restricted`, `not_allowed`.

Rules:
1. Only propose a change if you found a specific, current, authoritative
   source that supports a **different** value than the one given below.
2. Every change must include the exact source URL you used and today's date.
3. If you cannot find a reliable current source for a field, or the current
   value is still correct, do not include it in `changes`.
4. If nothing changed for this country, set `noChangesFound: true` and leave
   `changes` empty.
5. Do not guess or rely on memorized training data — every change must trace
   to a page you actually retrieved via the web_search tool this run.
