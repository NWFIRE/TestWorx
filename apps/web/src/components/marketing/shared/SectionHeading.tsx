import { Eyebrow } from "./Eyebrow";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left"
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-slate-950 md:text-4xl xl:text-[44px] xl:leading-[1.02]">
        {title}
      </h2>
      {body ? <p className="mt-4 text-base leading-7 text-slate-600 md:text-lg md:leading-8">{body}</p> : null}
    </div>
  );
}
