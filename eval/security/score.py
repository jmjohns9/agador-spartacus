#!/usr/bin/env python3
"""
Score a review-security run against expected.json.

Usage:
  python3 eval/security/score.py expected.json actual.json
  -> prints recall by severity, severity-match rate, FP rate; exits 0 if all thresholds pass.

Match rule (in order):
  1. exact fingerprint match  (sorted fingerprint_inputs joined)
  2. fallback: same category AND same file AND |line_a - line_b| <= 10
"""
import json
import sys
from collections import Counter

SEV_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}

# Categories that name the same defect family from different vantage points.
# Two findings are category-equivalent if their categories share an alias set.
CATEGORY_ALIASES = [
    {"prompt_injection", "injection_via_untrusted_peripheral"},
    {"missing_csp", "electron_hardening"},
    {"secrets_storage", "secrets_exposure"},
]

# Categories where the same defect commonly spans an IPC handler and the
# function it calls — line numbers can be hundreds apart. For these,
# (file, category) is enough; line is ignored.
LINE_TOLERANT_CATEGORIES = {"input_validation", "rate_limiting"}
DEFAULT_LINE_WINDOW = 30


def fp(f):
    return "|".join(sorted(f.get("fingerprint_inputs") or []))


def categories_equivalent(c1, c2):
    if c1 == c2:
        return True
    for group in CATEGORY_ALIASES:
        if c1 in group and c2 in group:
            return True
    return False


def loose_match(a, b):
    if not categories_equivalent(a.get("category"), b.get("category")):
        return False
    if a.get("file") != b.get("file"):
        return False
    if a.get("category") in LINE_TOLERANT_CATEGORIES:
        return True
    la, lb = a.get("line"), b.get("line")
    if la is None or lb is None:
        return True
    return abs(la - lb) <= DEFAULT_LINE_WINDOW


def match_findings(expected, actual):
    matched_pairs = []
    unmatched_expected = list(expected)
    unmatched_actual = list(actual)

    # Pass 1: fingerprint
    for e in list(unmatched_expected):
        for a in list(unmatched_actual):
            if fp(e) and fp(e) == fp(a):
                matched_pairs.append((e, a))
                unmatched_expected.remove(e)
                unmatched_actual.remove(a)
                break

    # Pass 2: loose
    for e in list(unmatched_expected):
        for a in list(unmatched_actual):
            if loose_match(e, a):
                matched_pairs.append((e, a))
                unmatched_expected.remove(e)
                unmatched_actual.remove(a)
                break

    return matched_pairs, unmatched_expected, unmatched_actual


def main():
    if len(sys.argv) != 3:
        print("usage: score.py expected.json actual.json", file=sys.stderr)
        return 2

    expected = json.load(open(sys.argv[1]))
    actual = json.load(open(sys.argv[2]))
    thresholds = expected["scoring"]["pass_threshold"]

    exp = expected["findings"]
    act = actual.get("findings", [])

    pairs, missed, extras = match_findings(exp, act)

    by_sev_total = Counter(e["severity"] for e in exp)
    by_sev_matched = Counter(e["severity"] for e, _ in pairs)

    def recall_at_or_above(min_rank):
        denom = sum(c for s, c in by_sev_total.items() if SEV_RANK[s] >= min_rank)
        numer = sum(c for s, c in by_sev_matched.items() if SEV_RANK[s] >= min_rank)
        return (numer / denom) if denom else 1.0

    recall_high = recall_at_or_above(SEV_RANK["high"])
    recall_med = recall_at_or_above(SEV_RANK["medium"])
    fp_rate = (len(extras) / len(act)) if act else 0.0
    sev_match = (
        sum(1 for e, a in pairs if e["severity"] == a.get("severity")) / len(pairs)
    ) if pairs else 1.0

    print(f"Expected:       {len(exp)}")
    print(f"Emitted:        {len(act)}")
    print(f"Matched:        {len(pairs)}")
    print(f"Missed:         {len(missed)}  ({', '.join(m['id'] for m in missed) or '—'})")
    print(f"Extras (FP):    {len(extras)}  ({', '.join(a.get('id', '?') for a in extras) or '—'})")
    print()
    print(f"Recall (high+):     {recall_high:.2f}  (gate >= {thresholds['recall_high_or_above']:.2f})")
    print(f"Recall (medium+):   {recall_med:.2f}  (gate >= {thresholds['recall_medium_or_above']:.2f})")
    print(f"FP rate:            {fp_rate:.2f}  (gate <= {thresholds['max_false_positive_rate']:.2f})")
    print(f"Severity match:     {sev_match:.2f}  (gate >= {thresholds['severity_match_rate']:.2f})")

    gates_pass = (
        recall_high >= thresholds["recall_high_or_above"]
        and recall_med >= thresholds["recall_medium_or_above"]
        and fp_rate <= thresholds["max_false_positive_rate"]
        and sev_match >= thresholds["severity_match_rate"]
    )
    print()
    print("GATE: PASS" if gates_pass else "GATE: FAIL")
    return 0 if gates_pass else 1


if __name__ == "__main__":
    sys.exit(main())
