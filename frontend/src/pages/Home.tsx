import { AlertStrip } from "../components/AlertStrip";
import { CostSummary } from "../components/CostSummary";
import { IdleHeadroomPanel } from "../components/IdleHeadroomPanel";
import { PlatformTable } from "../components/PlatformTable";
import { MOCK_ALERTS, MOCK_USAGE_RECORDS, PLATFORMS } from "../data/mockData";

/**
 * Three clearly labeled, visually distinct zones: alerts, then current
 * usage (the bars/table), then cost last — current status matters more
 * than the monthly total at a glance. See
 * design/persona-fixes-changelog.md for why this restructure happened.
 */
export function Home() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Status snapshot
        </h2>
        <AlertStrip alerts={MOCK_ALERTS} />
      </section>

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
