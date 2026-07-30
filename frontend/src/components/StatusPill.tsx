import { STATUS_LABEL, STATUS_VAR } from "../lib/status";
import type { Status } from "../types";

export function StatusPill({ status, text }: { status: Status; text?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      style={{ color: `var(${STATUS_VAR[status]})` }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(${STATUS_VAR[status]})` }} />
      {text ?? STATUS_LABEL[status]}
    </span>
  );
}
