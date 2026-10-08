import type { DirectorAction } from "./types";

export interface CaseFact {
  id: string;
  when: RegExp;
  text: string;
}

export interface Assessment {
  action: DirectorAction;
  say: string;
}

export interface Scenario {
  id: string;
  trackId: string;
  prompt: string;
  facts: CaseFact[];
  pressureFallback: string;
  caseKey?: string;
  assess?: (utterance: string) => Assessment | null;
}

const SCENARIOS: Scenario[] = [
  {
    id: "activation",
    trackId: "product",
    prompt:
      "Let's shift to a situation you might see in the role. Activation has declined 15% over the last two weeks. How would you investigate?",
    facts: [
      {
        id: "segment",
        when: /\b(segment|platform|ios|android|new users?|returning|cohort|which users|who is)\b/i,
        text: "You can take this as given: the drop is concentrated in new users on iOS. Android and returning users are flat.",
      },
      {
        id: "release",
        when: /\b(release|shipped|version|bug|verification|what changed|recently shipped)\b/i,
        text: "You can take this as given: iOS 4.2 shipped 16 days ago. It added a required phone verification before the first key action.",
      },
      {
        id: "funnel",
        when: /\b(how many|volume|funnel|completion|conversion rate|activation rate|12,?000)\b/i,
        text: "You can take this as given: daily new iOS users are steady at about 12,000. Verification completion fell from 80% to 61%. Activation moved from 40% to 34%.",
      },
    ],
    pressureFallback:
      "You've been treating the drop as something to diagnose before you ship a fix. What evidence would make you skip the diagnosis and intervene the same day?",
    caseKey:
      "Activation fell from 40% to 34%, which is a 15% relative decline. Daily new iOS users stayed near 12,000. Verification completion fell from 80% to 61% after iOS 4.2 added a required phone check. Android and returning users were flat.",
  },
  {
    id: "retailer",
    trackId: "consulting",
    prompt:
      "Let's shift to a situation you might see in the role. A regional retailer has had declining profitability despite increasing revenue. How would you approach the problem?",
    facts: [
      {
        id: "revenue",
        when: /\b(revenue|top line|sales)\b/i,
        text: "You can take this as given: revenue rose from $500 million to $540 million, up 8%.",
      },
      {
        id: "margin",
        when: /\b(margin|gross profit|cost of goods|profitability)\b/i,
        text: "You can take this as given: gross margin fell from 32% to 27%. Store operating costs were flat.",
      },
      {
        id: "mix",
        when: /\b(mix|channel|wholesale|stores?|segment|where did the growth)\b/i,
        text: "You can take this as given: the growth came from a new wholesale channel. Wholesale is about a quarter of revenue and carries a 12% gross margin. The stores still run near 36%.",
      },
    ],
    pressureFallback:
      "You've framed this as a margin problem rather than a demand problem. What evidence would make you treat demand as the thing to fix first?",
    caseKey:
      "Revenue moved from $500 million to $540 million. Gross profit moved from $160 million (32%) to $145.8 million (27%). The added revenue is a lower-margin wholesale mix; store costs were flat.",
    assess(utterance) {
      if (/\bmargin\b[^.]{0,40}\b(increased|expanded|improved|up)\b/i.test(utterance)) {
        return {
          action: "CHALLENGE_ASSUMPTION",
          say: "Revenue is up, but profitability is down. What would you want to see broken out before you explain that gap?",
        };
      }
      return null;
    },
  },
  {
    id: "depreciation",
    trackId: "banking",
    prompt:
      "Let's move to a technical question. Walk me through how a change in depreciation affects the three financial statements. Use a $100 increase in depreciation and a 25% tax rate.",
    facts: [],
    pressureFallback:
      "You treated the tax rate as fixed at 25 percent. What would change in the three statements if that depreciation were not tax-deductible?",
    caseKey:
      "Depreciation up $100, tax rate 25%. Income statement: pretax income down $100, tax down $25, net income down $75. Cash flow: net income down $75, depreciation added back $100, cash up $25. Balance sheet: cash up $25, net plant down $100, retained earnings down $75.",
    assess(utterance) {
      const text = utterance.toLowerCase();
      const income = /net income|income statement|pretax/.test(text);
      const cash = /cash flow|statement of cash|cash is|cash from operations/.test(text);
      const balance = /balance sheet|retained earnings|net plant|pp&e|ppe/.test(text);
      const ni100 = /net income[^.]{0,48}(\$| )?100\b/.test(text) || /\b100\b[^.]{0,48}net income/.test(text);
      const ni75 = /net income[^.]{0,48}(\$| )?75\b/.test(text) || /\b75\b[^.]{0,48}net income/.test(text);
      if (ni100 && !ni75) {
        return {
          action: "CLARIFY_RESPONSE",
          say: "Hold the tax rate at 25 percent. Depreciation is up $100, so pretax income is down $100. How much tax do you save, and what is left of net income?",
        };
      }
      if (!income) {
        return {
          action: "PROBE_DEEPER",
          say: "Start with the income statement. Depreciation is up $100 and the tax rate is 25 percent. What happens to pretax income, tax, and net income?",
        };
      }
      if (!cash) {
        return {
          action: "PROBE_DEEPER",
          say: "Stay with the cash flow statement. You add depreciation back. What happens to cash?",
        };
      }
      if (!balance) {
        return {
          action: "PROBE_DEEPER",
          say: "And the balance sheet: what happens to cash, net plant, and retained earnings?",
        };
      }
      return null;
    },
  },
  {
    id: "events",
    trackId: "software",
    prompt:
      "Let's shift to a design question. Design a system that can reliably process a large volume of user-generated events. Talk me through the shape of it before the components.",
    facts: [
      {
        id: "rate",
        when: /\b(how many|volume|qps|per second|throughput|peak|traffic)\b/i,
        text: "You can take this as given: peak is 50,000 events per second. A typical second is closer to 8,000.",
      },
      {
        id: "delivery",
        when: /\b(duplicates?|at least once|exactly once|delivery|retries|retry|idempoten\w*)\b/i,
        text: "You can take this as given: delivery is at-least-once. Consumers have to tolerate duplicates.",
      },
      {
        id: "size",
        when: /\b(how big|payload|event size|bytes|kilobytes?)\b/i,
        text: "You can take this as given: the average event is 2KB.",
      },
      {
        id: "order",
        when: /\b(ordering|partition|per user|shard|sequence)\b/i,
        text: "You can take this as given: consumers need ordering per user, not a single global order.",
      },
    ],
    pressureFallback:
      "You've designed for throughput. What evidence would make you give up per-user ordering to keep the system up?",
    caseKey:
      "Peak 50,000 events per second, typical 8,000, average size 2KB, at-least-once delivery, ordering required per user rather than globally.",
    assess(utterance) {
      const text = utterance.toLowerCase();
      const mentionsReliability = /duplicate|idempoten|retry|at least once|ordering|partition/.test(text);
      if (!mentionsReliability && wordish(text) > 12) {
        return {
          action: "PROBE_DEEPER",
          say: "What has to stay true when the same event arrives twice, or when one consumer falls behind?",
        };
      }
      return null;
    },
  },
  {
    id: "campaign",
    trackId: "marketing",
    prompt:
      "Let's shift to a situation you might see in the role. Spend on a campaign is flat, but attributed revenue is down 18% week over week. How would you investigate?",
    facts: [
      {
        id: "safari",
        when: /tracking|pixel|attribution|browser|safari|tag/i,
        text: "You can take this as given: a conversion pixel stopped firing on Safari the day the drop started. Other browsers are flat.",
      },
      {
        id: "promo",
        when: /promo|code|channel|mix|discount/i,
        text: "You can take this as given: a promo-code channel was folded into paid social the same week, so last-click credit moved.",
      },
    ],
    pressureFallback:
      "You've treated this as a measurement problem. What evidence would make you cut the campaign before the tracking is repaired?",
    caseKey: "Spend flat. Attributed revenue down 18%. Safari pixel outage plus a promo-code channel merged into paid social.",
  },
  {
    id: "defaults",
    trackId: "data",
    prompt:
      "Let's shift to a situation you might see in the role. A model used for loan pre-qualification shows a rising approval rate and a rising early-default rate. How would you investigate?",
    facts: [
      {
        id: "threshold",
        when: /threshold|cutoff|score|policy|changed|what changed/i,
        text: "You can take this as given: on the 3rd, the approval threshold moved from 0.62 to 0.55. Nothing else in the feature pipeline changed that day.",
      },
      {
        id: "mix",
        when: /mix|population|segment|who is applying|applicant/i,
        text: "You can take this as given: the applicant mix also shifted toward thinner-file borrowers, from 20% of volume to 33%.",
      },
    ],
    pressureFallback:
      "You've focused on the threshold change. What evidence would make you put the model back to 0.62 before you understood the mix shift?",
    caseKey: "Approval threshold moved from 0.62 to 0.55 on the 3rd. Thinner-file applicants moved from 20% to 33% of volume. Both approval and early default rose.",
  },
  {
    id: "subscription",
    trackId: "strategy",
    prompt:
      "Let's shift to a situation you might see in the role. A subscription business is growing revenue 12% while contribution margin falls. How would you approach it?",
    facts: [
      {
        id: "discount",
        when: /discount|price|annual|plan|promotion/i,
        text: "You can take this as given: annual plans are discounted 30% this quarter, up from 10% last quarter. Monthly price is unchanged.",
      },
      {
        id: "support",
        when: /cost|support|margin|contribution|service/i,
        text: "You can take this as given: support cost per user is up 22%, concentrated in the first 30 days of the new annual cohort.",
      },
    ],
    pressureFallback:
      "You've leaned on price. What evidence would make you leave the discount in place and fix onboarding cost instead?",
    caseKey: "Revenue up 12%. Annual discount moved from 10% to 30%. Support cost per user up 22% in the first 30 days of that cohort.",
  },
  {
    id: "commitment",
    trackId: "behavioral",
    prompt:
      "Let's shift to a situation. Your team missed a commitment a customer has already announced. How do you handle the next 48 hours?",
    facts: [
      {
        id: "slip",
        when: /how long|how late|when did|slip|delay/i,
        text: "You can take this as given: the miss is two weeks. The customer is the largest account.",
      },
      {
        id: "warning",
        when: /who knew|warning|flag|earlier|risk|wrote/i,
        text: "You can take this as given: one engineer flagged the risk in writing a month ago. The note went to you.",
      },
    ],
    pressureFallback:
      "You've focused on repairing the date. What evidence would make you tell the customer the original date still holds?",
    caseKey: "The commitment is two weeks late. The customer is the largest account. An engineer flagged the risk in writing a month ago, to the candidate.",
  },
];

function wordish(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}

export function scenarioFor(trackId: string): Scenario {
  return SCENARIOS.find((scenario) => scenario.trackId === trackId) ?? SCENARIOS[SCENARIOS.length - 1];
}

export function matchingFact(scenario: Scenario, utterance: string, revealed: string[]): CaseFact | undefined {
  return scenario.facts.find((fact) => !revealed.includes(fact.id) && fact.when.test(utterance));
}
