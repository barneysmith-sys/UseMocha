"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RUBRIC, type CareerTrack, type InterviewOption } from "@/lib/careers";

type Props = {
  track: CareerTrack;
  option: InterviewOption;
  onBack: () => void;
};

export function InterviewSetupPreview({ track, option, onBack }: Props) {
  const router = useRouter();
  const [minutes, setMinutes] = useState<8 | 20>(20);
  return (
    <div className="px-4 pb-4 pt-3 sm:px-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Prototype session · {track.name}</p>
      <h3 className="mt-2 text-[22px] font-medium leading-none tracking-[-0.03em] text-ink">{option.name}</h3>
      <p className="mt-1 text-[12px] uppercase tracking-[0.14em] text-cobalt">{option.type}</p>
      <p className="mt-3 max-w-[58ch] text-[14.5px] leading-relaxed text-ink/80">{option.summary}</p>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden border border-line bg-line sm:grid-cols-3">
        <Meta label="Length" value={`${minutes} min`} />
        <Meta label="Feedback" value="After the round" />
        <Meta label="Format" value="Spoken round" className="col-span-2 sm:col-span-1" />
      </dl>

      <figure className="mt-4 border-l border-cobalt pl-3">
        <figcaption className="text-[11px] uppercase tracking-[0.16em] text-muted">Opening question</figcaption>
        <blockquote className="mt-1.5 text-[15.5px] leading-snug tracking-[-0.02em] text-ink">{option.sampleQuestion}</blockquote>
      </figure>

      <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
        <span className="text-ink">Likely follow-up. </span>
        {option.followUp}
      </p>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{option.focus}</p>

      <ul className="mt-4 grid grid-cols-2 gap-2">
        {RUBRIC.map((item) => (
          <li key={item.key} className="border border-line px-2.5 py-2">
            <span className="block text-[11px] uppercase tracking-[0.14em] text-cobalt">{item.label}</span>
            <span className="mt-1 block text-[12.5px] leading-snug text-muted">{item.meaning}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        {track.calibration} Illustrative pathway — not a partnership or licensed interview.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Interview length">
        <LengthButton current={minutes} value={8} onPick={setMinutes} label="8 min" />
        <LengthButton current={minutes} value={20} onPick={setMinutes} label="20 min" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 px-1 py-2 text-[14px] text-muted hover:text-ink">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />
          Back
        </button>
        <button
          type="button"
          onClick={() => router.push(`/interview?track=${encodeURIComponent(track.id)}&option=${encodeURIComponent(option.id)}&minutes=${minutes}`)}
          className="bg-ink px-4 py-2.5 text-[14px] font-medium text-white hover:bg-cobalt"
        >
          Start practicing
        </button>
      </div>
    </div>
  );
}

function LengthButton({
  current,
  value,
  label,
  onPick,
}: {
  current: 8 | 20;
  value: 8 | 20;
  label: string;
  onPick: (value: 8 | 20) => void;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onPick(value)}
      className={`border px-3 py-1.5 text-[13px] ${selected ? "border-ink bg-ink text-white" : "border-line text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );
}

function Meta({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`bg-white px-3 py-2.5 ${className}`}>
      <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className="mt-1 text-[13.5px] text-ink">{value}</dd>
    </div>
  );
}
