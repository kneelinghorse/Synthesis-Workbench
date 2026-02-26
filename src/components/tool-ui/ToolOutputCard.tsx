import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ToolOutputStatusTone =
  | "running"
  | "requires-action"
  | "complete"
  | "incomplete"
  | "error";

export type ToolOutputCalloutTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export const toolOutputCardStyles = {
  root: "rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/90 shadow-sm backdrop-blur",
  header: "flex flex-wrap items-start justify-between gap-3",
  heading: "flex flex-col gap-1",
  eyebrow: "text-xs uppercase tracking-[0.3em] text-white/50",
  title: "text-lg font-semibold text-white",
  description: "text-sm text-white/70",
  status: "rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em]",
  body: "mt-4 space-y-3",
  meta: "rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/60",
  footer: "mt-4 flex flex-wrap items-center justify-between gap-3",
  callout: "rounded-xl border px-3 py-3 text-sm",
};

const statusToneStyles: Record<ToolOutputStatusTone, string> = {
  running: "border-amber-400/40 text-amber-100",
  "requires-action": "border-cyan-400/40 text-cyan-100",
  complete: "border-emerald-400/40 text-emerald-100",
  incomplete: "border-rose-400/40 text-rose-100",
  error: "border-rose-400/40 text-rose-100",
};

const statusLabels: Record<ToolOutputStatusTone, string> = {
  running: "Running",
  "requires-action": "Needs input",
  complete: "Complete",
  incomplete: "Incomplete",
  error: "Error",
};

const calloutToneStyles: Record<ToolOutputCalloutTone, string> = {
  neutral: "border-white/10 bg-white/5 text-white/70",
  info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-100",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-100",
};

export const ToolOutputCard = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={cn(toolOutputCardStyles.root, className)}>{children}</div>;

export const ToolOutputCardHeader = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={cn(toolOutputCardStyles.header, className)}>{children}</div>;

export const ToolOutputCardHeading = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={cn(toolOutputCardStyles.heading, className)}>{children}</div>;

export const ToolOutputCardEyebrow = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={cn(toolOutputCardStyles.eyebrow, className)}>{children}</div>;

export const ToolOutputCardTitle = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={cn(toolOutputCardStyles.title, className)}>{children}</div>;

export const ToolOutputCardDescription = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={cn(toolOutputCardStyles.description, className)}>{children}</div>;

export const ToolOutputCardStatus = ({
  status,
  label,
  className,
}: {
  status: ToolOutputStatusTone;
  label?: string;
  className?: string;
}) => (
  <div
    className={cn(
      toolOutputCardStyles.status,
      statusToneStyles[status],
      className
    )}
  >
    {label ?? statusLabels[status]}
  </div>
);

export const ToolOutputCardBody = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={cn(toolOutputCardStyles.body, className)}>{children}</div>;

export const ToolOutputCardMeta = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={cn(toolOutputCardStyles.meta, className)}>{children}</div>;

export const ToolOutputCardFooter = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => <div className={cn(toolOutputCardStyles.footer, className)}>{children}</div>;

export const ToolOutputCardCallout = ({
  tone = "neutral",
  className,
  children,
}: {
  tone?: ToolOutputCalloutTone;
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn(toolOutputCardStyles.callout, calloutToneStyles[tone], className)}
  >
    {children}
  </div>
);
