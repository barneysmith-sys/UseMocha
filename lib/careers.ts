import type { LucideIcon } from "lucide-react";
import {
  ChartLine,
  Code,
  Compass,
  Landmark,
  Layers,
  Megaphone,
  MessagesSquare,
  Waypoints,
} from "lucide-react";

export type RubricKey = "structure" | "clarity" | "ownership" | "impact";

export type InterviewOption = {
  id: string;
  /** Second-level label, e.g. Behavioral interview */
  type: string;
  name: string;
  duration: string;
  summary: string;
  sampleQuestion: string;
  followUp: string;
  focus: string;
};

export type CareerTrack = {
  id: string;
  name: string;
  /** Short supporting line shown in the hero once the track is chosen. */
  line: string;
  detail: string;
  /** How the live product calibrates this kind of round. Not an affiliation. */
  calibration: string;
  icon: LucideIcon;
  options: InterviewOption[];
};

export const RUBRIC: { key: RubricKey; label: string; meaning: string }[] = [
  {
    key: "structure",
    label: "Structure",
    meaning: "Situation, task, action, and result in an order a panel can follow.",
  },
  {
    key: "clarity",
    label: "Clarity",
    meaning: "Precise language. No fog around what actually happened.",
  },
  {
    key: "ownership",
    label: "Ownership",
    meaning: "Your decision, in the first person, at the moment it mattered.",
  },
  {
    key: "impact",
    label: "Impact",
    meaning: "A result with a number, a comparison, or a consequence.",
  },
];

export const tracks: CareerTrack[] = [
  {
    id: "consulting",
    name: "Consulting",
    icon: Compass,
    detail: "Personal impact, drive, and leadership",
    calibration: "Patterned on MBB personal-experience interviews.",
    line: "Practice the follow-up a consulting interviewer asks when the story slips into “we.”",
    options: [
      {
        id: "mckinsey-style",
        type: "Behavioral interview",
        name: "McKinsey-style practice",
        duration: "12 min",
        summary:
          "A personal-experience round. Mocha listens for the moment you influenced someone, then asks about the sentence you softened.",
        sampleQuestion:
          "Tell me about a time you influenced a stakeholder who had more information than you.",
        followUp: "Who still disagreed when you left the room, and what did you say to them?",
        focus: "Personal impact. The panel wants the decision in your voice.",
      },
      {
        id: "ambiguous-structure",
        type: "Judgment interview",
        name: "Structuring an ambiguous call",
        duration: "12 min",
        summary:
          "Not a written case. A behavioral round about how you framed a messy problem before you had the data.",
        sampleQuestion: "When have you had to make a call with incomplete information?",
        followUp: "What did you decide not to wait for, and what was the cost if you were wrong?",
        focus: "Entrepreneurial drive under ambiguity.",
      },
      {
        id: "resistance",
        type: "Leadership interview",
        name: "Leading through resistance",
        duration: "12 min",
        summary: "A round about bringing other people with you when the room was not convinced.",
        sampleQuestion: "Tell me about a time you led a team through resistance.",
        followUp: "What did the strongest objection sound like, in their words?",
        focus: "Inclusive leadership. Consensus is not the same as agreement.",
      },
    ],
  },
  {
    id: "banking",
    name: "Investment Banking",
    icon: Landmark,
    detail: "Judgment, pressure, and clean numbers",
    calibration: "Patterned on analyst superdays at bulge-bracket banks.",
    line: "Practice answers a banking interviewer will push until the number, and the owner, are specific.",
    options: [
      {
        id: "analyst-recruiting",
        type: "Behavioral interview",
        name: "Analyst recruiting",
        duration: "12 min",
        summary:
          "The fit round beside the technicals. Mocha presses on deadlines, mistakes, and whether you can defend a figure.",
        sampleQuestion: "Walk me through a time you worked under extreme deadline pressure.",
        followUp: "What did you cut, and who felt that cut?",
        focus: "Execution under pressure, with a commercial frame.",
      },
      {
        id: "late-error",
        type: "Judgment interview",
        name: "The error you caught late",
        duration: "10 min",
        summary: "A round about integrity when a number is already in the draft.",
        sampleQuestion: "Tell me about a time you caught an error late in a process.",
        followUp: "Who had already seen the wrong figure, and what did you tell them?",
        focus: "Integrity and precision. Vague remorse does not score.",
      },
      {
        id: "defend-a-number",
        type: "Behavioral interview",
        name: "Defending a number",
        duration: "10 min",
        summary: "Practice staying exact when someone senior asks you to walk the math back.",
        sampleQuestion: "Describe a time you had to defend a number you were not certain about.",
        followUp: "What was the range, and which assumption moved it most?",
        focus: "Technical judgment without bluffing.",
      },
    ],
  },
  {
    id: "product",
    name: "Product Management",
    icon: Layers,
    detail: "Sense, execution, and tradeoffs",
    calibration: "Patterned on product and leadership-principle rounds.",
    line: "Practice product rounds where the follow-up asks what you shipped, what you cut, and how you knew.",
    options: [
      {
        id: "product-design",
        type: "Product sense",
        name: "Product design interview",
        duration: "14 min",
        summary:
          "A verbal product-sense round. You frame the user, the bet, and the tradeoff. Mocha asks where the reasoning skipped.",
        sampleQuestion:
          "Tell me about a product decision you got wrong. What did you believe, and what happened?",
        followUp: "Which user did you decide not to serve, and how did you know that was the right cut?",
        focus: "Product sense. A clean narrative is not the same as a real tradeoff.",
      },
      {
        id: "metric",
        type: "Execution interview",
        name: "The metric you moved",
        duration: "12 min",
        summary: "A round about a number you owned, including the week it did not move.",
        sampleQuestion: "Tell me about a metric you moved and how you knew.",
        followUp: "What else moved when that metric moved?",
        focus: "Impact with a counter-metric, not a single celebratory figure.",
      },
      {
        id: "stakeholder-no",
        type: "Behavioral interview",
        name: "Saying no to a stakeholder",
        duration: "10 min",
        summary: "Practice the conversation where you declined a request and kept the relationship.",
        sampleQuestion: "When did you have to say no to a stakeholder?",
        followUp: "What did they ask for in their words, and what did you offer instead?",
        focus: "Ownership of the no. Diplomacy without disappearing.",
      },
    ],
  },
  {
    id: "software",
    name: "Software Engineering",
    icon: Code,
    detail: "Ownership, failure, and collaboration",
    calibration: "Patterned on behavioral rounds beside the coding loop.",
    line: "Practice the behavioral half of an engineering loop: scope, failure, and what you personally changed.",
    options: [
      {
        id: "ownership",
        type: "Behavioral interview",
        name: "Ownership beyond your scope",
        duration: "12 min",
        summary: "A round about work you took before anyone assigned it, and the blast radius if you had not.",
        sampleQuestion: "Describe a time you took ownership of a problem outside your role.",
        followUp: "What broke first, and what did you change in the system rather than the ticket?",
        focus: "Ownership. “We shipped” is not a description of your judgment.",
      },
      {
        id: "failure",
        type: "Behavioral interview",
        name: "A production failure",
        duration: "12 min",
        summary: "Practice telling a failure without hiding inside the postmortem’s passive voice.",
        sampleQuestion: "Tell me about a time something you shipped failed.",
        followUp: "What was the first signal, and what did you do in the first hour?",
        focus: "Clarity under blame. The timeline matters more than the lesson slide.",
      },
      {
        id: "disagreement",
        type: "Collaboration interview",
        name: "A technical disagreement",
        duration: "10 min",
        summary: "A round about changing your mind, or holding it, when the design was contested.",
        sampleQuestion: "Tell me about a technical decision you lost, or won, in review.",
        followUp: "What evidence would have changed your mind the other way?",
        focus: "Judgment. Conviction with an exit condition.",
      },
    ],
  },
  {
    id: "marketing",
    name: "Marketing & Growth",
    icon: Megaphone,
    detail: "Insight, measurement, and creative calls",
    calibration: "Patterned on brand and growth interviews.",
    line: "Practice growth stories where the result is measured and the failed channel is named.",
    options: [
      {
        id: "underperformed",
        type: "Behavioral interview",
        name: "A campaign that missed",
        duration: "12 min",
        summary: "A round about a launch that did not work, and the decision you made the week after.",
        sampleQuestion: "Tell me about a campaign that underperformed.",
        followUp: "What did you stop spending on, and what evidence made that acceptable?",
        focus: "Measured growth. Taste is not a metric.",
      },
      {
        id: "best-result",
        type: "Impact interview",
        name: "The result you can measure",
        duration: "10 min",
        summary: "Practice a success story that survives the question “compared with what?”",
        sampleQuestion: "Tell me about the best result you have driven and how you measured it.",
        followUp: "What was the baseline, and what did you hold constant?",
        focus: "Impact with a baseline, not a highlight.",
      },
      {
        id: "overruled",
        type: "Judgment interview",
        name: "A creative call, overruled",
        duration: "10 min",
        summary: "A round about a recommendation you lost and what you did with the brief anyway.",
        sampleQuestion: "When was a creative call of yours overruled?",
        followUp: "What did you change in the work after the decision, specifically?",
        focus: "Consumer insight without sulking.",
      },
    ],
  },
  {
    id: "data",
    name: "Data & Analytics",
    icon: ChartLine,
    detail: "Conviction, risk, and translation",
    calibration: "Patterned on analytics and research interviews.",
    line: "Practice analytical stories where the insight changed a decision, not just a chart.",
    options: [
      {
        id: "risk",
        type: "Judgment interview",
        name: "A risk others missed",
        duration: "12 min",
        summary: "A round about an assumption you challenged, and what the room did with it.",
        sampleQuestion: "Tell me about a time you identified a risk others missed.",
        followUp: "What data would have proven you wrong?",
        focus: "Conviction with a falsifier.",
      },
      {
        id: "analysis",
        type: "Impact interview",
        name: "Analysis that changed an outcome",
        duration: "12 min",
        summary: "Practice walking from a dataset to a decision someone else had to make.",
        sampleQuestion: "Walk me through an analysis that changed an outcome.",
        followUp: "What did the decision-maker do differently on the Monday after?",
        focus: "Impact outside the notebook.",
      },
      {
        id: "wrong-assumption",
        type: "Behavioral interview",
        name: "An assumption that failed",
        duration: "10 min",
        summary: "A round about discovering your own model was wrong and saying so early.",
        sampleQuestion: "Tell me about a time your assumptions turned out wrong.",
        followUp: "When did you first see it, and who did you tell before you were sure?",
        focus: "Clarity. The date of the correction matters.",
      },
    ],
  },
  {
    id: "strategy",
    name: "Strategy & Operations",
    icon: Waypoints,
    detail: "Calls, systems, and alignment",
    calibration: "Patterned on strategy and operations interviews.",
    line: "Practice operations stories where the constraint, the call, and the measured change are all visible.",
    options: [
      {
        id: "incomplete",
        type: "Judgment interview",
        name: "A call with incomplete information",
        duration: "12 min",
        summary: "A round about choosing before the analysis was finished, and living with the residue.",
        sampleQuestion: "When have you had to make a call with incomplete information?",
        followUp: "What did you write down as the thing you were explicitly not deciding?",
        focus: "Structure. A decision has a boundary.",
      },
      {
        id: "process",
        type: "Impact interview",
        name: "A process you changed",
        duration: "10 min",
        summary: "Practice describing an operational change from the point of view of the people inside it.",
        sampleQuestion: "Tell me about a process you improved for the people using it.",
        followUp: "What got slower, on purpose?",
        focus: "Impact with a tradeoff, not only a saved hour.",
      },
      {
        id: "alignment",
        type: "Behavioral interview",
        name: "Alignment without authority",
        duration: "12 min",
        summary: "A round about moving a plan forward when the people who had to do it did not report to you.",
        sampleQuestion: "Tell me about a time you led people who did not report to you.",
        followUp: "What did you need from them, and what did they need from you?",
        focus: "Ownership without a title.",
      },
    ],
  },
  {
    id: "behavioral",
    name: "General Behavioral Interviews",
    icon: MessagesSquare,
    detail: "Conflict, failure, and leadership",
    calibration: "The same four-part rubric, without a single industry frame.",
    line: "Practice the questions that show up in almost every loop, scored the same way a panel scores them.",
    options: [
      {
        id: "conflict",
        type: "Behavioral interview",
        name: "Conflict",
        duration: "10 min",
        summary: "A round about a disagreement you stayed inside, instead of smoothing over.",
        sampleQuestion: "Tell me about a conflict with someone you needed to keep working with.",
        followUp: "What did they want that you did not give them?",
        focus: "Ownership of your side of the disagreement.",
      },
      {
        id: "failure-general",
        type: "Behavioral interview",
        name: "Failure",
        duration: "10 min",
        summary: "Practice a failure story that names the miss before it names the lesson.",
        sampleQuestion: "Tell me about a time you failed at something that mattered to you.",
        followUp: "What would a skeptic say you still have not fixed?",
        focus: "Clarity. The lesson cannot replace the event.",
      },
      {
        id: "leadership-general",
        type: "Leadership interview",
        name: "Leadership",
        duration: "12 min",
        summary: "A round about a moment you set a direction other people actually followed.",
        sampleQuestion: "Tell me about a time you led a group through something hard.",
        followUp: "Who did not follow, and what did you do about that person?",
        focus: "Leadership as a specific act, not a mood.",
      },
    ],
  },
];

export function findTrack(id: string | null) {
  return tracks.find((track) => track.id === id) ?? null;
}

export function findOption(trackId: string | null, optionId: string | null) {
  const track = findTrack(trackId);
  if (!track) return null;
  return track.options.find((option) => option.id === optionId) ?? null;
}
