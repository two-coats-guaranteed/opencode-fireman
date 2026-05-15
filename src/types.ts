/**
 * A region of code Fireman has flagged as structurally suspicious.
 *
 * The detector emits findings; the plugin wraps them into a compact warning
 * for the agent. The bench harness compares findings against truth.json.
 */
export interface Finding {
  /** Absolute path to the file containing the suspicious region. */
  file: string;
  /** 1-indexed inclusive start line. */
  start_line: number;
  /** 1-indexed inclusive end line. */
  end_line: number;
  /** Trap category — see bench/README.md for the canonical list. */
  category: string;
  /** Human-readable explanation, kept short so warnings stay token-cheap. */
  rationale: string;
}
