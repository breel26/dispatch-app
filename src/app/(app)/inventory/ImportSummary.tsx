import type { ImportActionState } from "./importActions";
import styles from "./form.module.css";

type Summary = NonNullable<ImportActionState["summary"]>;

// Shared by both importers so a skipped row reads the same either way.
export default function ImportSummary({ summary }: { summary: Summary }) {
  return (
    <div className={styles.section}>
      <h2>Result</h2>
      <p>
        {summary.createdCount} created, {summary.updatedCount} updated
        {summary.errors.length > 0 && `, ${summary.errors.length} row(s) skipped`}.
      </p>
      {summary.errors.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Row</th>
              <th style={{ textAlign: "left" }}>Problem</th>
            </tr>
          </thead>
          <tbody>
            {summary.errors.map((e, i) => (
              <tr key={i}>
                <td>{e.row}</td>
                <td>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
