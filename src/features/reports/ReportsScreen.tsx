import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { Report } from "../../domain/types";

interface ReportsScreenProps {
  reports: Report[];
  onBack: () => void;
}

export function ReportsScreen({ reports, onBack }: ReportsScreenProps) {
  return (
    <section className="screen-stack" aria-labelledby="reports-title">
      <header className="screen-header">
        <button className="back-button" type="button" aria-label="Back to Inbox" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <p className="eyebrow">Report folders</p>
          <h1 id="reports-title">Reports</h1>
        </div>
      </header>
      {reports.map((report) => (
        <article className="report-panel" key={report.id}>
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>{report.name}</h2>
            <p>{report.dateRangeLabel}</p>
          </div>
          <strong>{report.expenseIds.length} items</strong>
        </article>
      ))}
    </section>
  );
}
