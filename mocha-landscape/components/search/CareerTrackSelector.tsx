"use client";

import { findTrack, tracks, type CareerTrack, type InterviewOption } from "@/lib/careers";

type TrackMode = {
  mode: "tracks";
  items: CareerTrack[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (id: string) => void;
};

type OptionMode = {
  mode: "options";
  track: CareerTrack;
  items: InterviewOption[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (id: string) => void;
};

type Props = TrackMode | OptionMode;

export function CareerTrackSelector(props: Props) {
  const listId = props.mode === "tracks" ? "career-tracks" : "career-options";
  return (
    <ul id={listId} role="listbox" aria-label={props.mode === "tracks" ? "Career tracks" : `${props.track.name} interviews`} className="max-h-[min(360px,46svh)] overflow-auto py-1.5">
      {props.items.length === 0 ? (
        <li className="px-4 py-6 text-[14px] text-muted">Nothing matches that search.</li>
      ) : props.mode === "tracks" ? (
        props.items.map((track, index) => {
          const Icon = track.icon;
          const active = index === props.activeIndex;
          return (
            <li key={track.id} role="presentation">
              <div
                id={`track-${track.id}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => props.onHover(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => props.onSelect(track.id)}
                className={`grid cursor-pointer grid-cols-[28px_1fr_auto] items-center gap-3 px-3.5 py-2.5 ${active ? "bg-ice" : ""}`}
              >
                <Icon aria-hidden="true" strokeWidth={1.5} className="h-[18px] w-[18px] text-cobalt" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium tracking-[-0.015em] text-ink">{track.name}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted">{track.detail}</span>
                </span>
                <span className="hidden text-[11px] uppercase tracking-[0.14em] text-muted sm:block">{track.options.length} paths</span>
              </div>
            </li>
          );
        })
      ) : (
        props.items.map((option, index) => {
          const active = index === props.activeIndex;
          return (
            <li key={option.id} role="presentation">
              <div
                id={`option-${option.id}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => props.onHover(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => props.onSelect(option.id)}
                className={`cursor-pointer px-3.5 py-2.5 ${active ? "bg-ice" : ""}`}
              >
                <span className="flex items-baseline justify-between gap-4">
                  <span className="text-[15px] font-medium tracking-[-0.015em] text-ink">{option.name}</span>
                  <span className="shrink-0 text-[12px] text-muted">{option.duration}</span>
                </span>
                <span className="mt-0.5 block text-[12px] uppercase tracking-[0.14em] text-cobalt">{option.type}</span>
              </div>
            </li>
          );
        })
      )}
    </ul>
  );
}

export function filterTracks(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter((track) =>
    [track.name, track.detail, track.calibration, track.line, ...track.options.map((option) => `${option.name} ${option.type}`)]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

export function filterOptions(trackId: string | null, query: string) {
  const track = findTrack(trackId);
  if (!track) return [];
  const q = query.trim().toLowerCase();
  if (!q) return track.options;
  return track.options.filter((option) => `${option.name} ${option.type} ${option.summary}`.toLowerCase().includes(q));
}
