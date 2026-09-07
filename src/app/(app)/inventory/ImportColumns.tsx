import styles from "./form.module.css";

export interface ImportColumn {
  name: string;
  required: boolean;
  note?: string;
}

// Extracted from ImportForm so the clash-resolving importer can show the
// same thing without a second copy of it drifting out of step.
export default function ImportColumns({ columns }: { columns: ImportColumn[] }) {
  return (
    <div className={styles.section}>
      <h2>Expected columns</h2>
      <p className={styles.hint}>
        The first row must be a header row with these column names (not case-sensitive). Columns
        not listed here are ignored.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Column</th>
            <th style={{ textAlign: "left" }}>Required</th>
            <th style={{ textAlign: "left" }}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => (
            <tr key={col.name}>
              <td>{col.name}</td>
              <td>{col.required ? "Yes" : "No"}</td>
              <td>{col.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
