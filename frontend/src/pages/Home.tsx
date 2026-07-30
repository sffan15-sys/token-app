import { CostSummary } from "../components/CostSummary";
import { IdleHeadroomPanel } from "../components/IdleHeadroomPanel";
import { PlatformTable } from "../components/PlatformTable";
import { MOCK_USAGE_RECORDS, PLATFORMS } from "../data/mockData";

/**
 * Usage first, cost second. Alerts have their own nav tab (Alerts.tsx) and
 * are intentionally NOT duplicated here — the owner found the alert list
 * on Home too heavy/card-like and wanted the table to be the very first
 * thing on the page. See design/persona-fixes-changelog.md for prior
 * history on this page's layout.
 */
export function Home() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Usage right now
        </h2>
        <PlatformTable platforms={PLATFORMS} records={MOCK_USAGE_RECORDS} />
        <IdleHeadroomPanel records={MOCK_USAGE_RECORDS} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Cost summary
        </h2>
        <CostSummary records={MOCK_USAGE_RECORDS} />
      </section>
    </div>
  );
}
