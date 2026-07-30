import { CostSummary } from "../components/CostSummary";
import { IdleHeadroomPanel } from "../components/IdleHeadroomPanel";
import { PlatformTable } from "../components/PlatformTable";
import { PLATFORMS } from "../data/mockData";
import {
  fetchConfig,
  fetchLatestUsage,
  fetchWasteHistory,
  useFetch,
} from "../lib/api";

/**
 * Usage first, cost second. Alerts have their own nav tab (Alerts.tsx) and
 * are intentionally NOT duplicated here — the owner found the alert list
 * on Home too heavy/card-like and wanted the table to be the very first
 * thing on the page. See design/persona-fixes-changelog.md for prior
 * history on this page's layout.
 */
export function Home() {
  const { data, loading, error } = useFetch(async () => {
    const [records, historyRecords, config] = await Promise.all([
      fetchLatestUsage(),
      fetchWasteHistory(),
      fetchConfig(),
    ]);
    return { records, historyRecords, planSelections: config.plans };
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4 text-sm sm:p-6" style={{ color: "var(--text-muted)" }}>
        Loading usage…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <div className="rounded-lg border p-4 text-sm" style={{ borderColor: "var(--status-critical)", color: "var(--text-primary)" }}>
          Couldn't reach the API server ({error}). Start it with <code>npm run server</code> from the
          project root, then reload.
        </div>
      </div>
    );
  }

  const usageRecords = data?.records ?? [];
  const historyRecords = data?.historyRecords ?? [];
  const planSelections = data?.planSelections ?? {};

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Usage right now
        </h2>
        <PlatformTable
          platforms={PLATFORMS}
          records={usageRecords}
          planSelections={planSelections}
        />
        {usageRecords.length === 0 && (
          <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            No data yet — run a collector (<code>npm run collect:vercel</code>, etc, or start{" "}
            <code>npm run server</code> to run them on a schedule).
          </div>
        )}
        <IdleHeadroomPanel
          records={usageRecords}
          planSelections={planSelections}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Cost summary
        </h2>
        <CostSummary
          records={usageRecords}
          historyRecords={historyRecords}
          planSelections={planSelections}
        />
      </section>
    </div>
  );
}
