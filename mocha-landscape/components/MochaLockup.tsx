type Props = {
  tone?: "light" | "ink";
  href?: string;
};

export function MochaLockup({ tone = "light", href = "/" }: Props) {
  const onBlue = tone === "light";
  return (
    <a href={href} className="inline-flex items-center gap-2.5 text-inherit no-underline">
      <img
        src="/brand/mark.png"
        alt=""
        width={512}
        height={498}
        className={`h-11 w-11 shrink-0 object-contain ${onBlue ? "" : "rounded-full bg-cobalt p-0.5"}`}
      />
      <span className="wordmark text-[15px] leading-none">mocha</span>
    </a>
  );
}
