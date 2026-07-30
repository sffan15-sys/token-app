import { AlertStrip } from "../components/AlertStrip";
import { IdleHeadroomPanel } from "../components/IdleHeadroomPanel";
import { PlatformCard } from "../components/PlatformCard";
import { MOCK_ALERTS, MOCK_USAGE_RECORDS, PLATFORMS } from "../data/mockData";

export function Home() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <AlertStrip alerts={MOCK_ALERTS} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PLATFORMS.map((meta) => (
          <PlatformCard key={meta.id} meta={meta} records={MOCK_USAGE_RECORDS} />
        ))}
      </div>

      <IdleHeadroomPanel records={MOCK_USAGE_RECORDS} />
    </div>
  );
}
