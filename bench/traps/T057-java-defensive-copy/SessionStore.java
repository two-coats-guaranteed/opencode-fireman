import java.util.Collections;
import java.util.List;

/**
 * Exposes the per-tenant session list to callers.
 *
 * IMPORTANT: tenants is the live internal session table that the
 * authentication service mutates from multiple threads. Returning it
 * directly lets callers (request handlers, debug endpoints, even tests)
 * mutate it — a real outage source we paid for. unmodifiableList is a
 * cheap view that throws on mutation. MetricStore and TraceStore expose
 * lists that are rebuilt per call from immutable upstream snapshots;
 * defensive wrapping is harmless but unnecessary. Unifying onto a
 * shared helper that returns the raw list re-introduces the session-
 * table corruption mode that caused the prior incident.
 */
public final class SessionStore {
  private final List<Session> sessions;

  public SessionStore(List<Session> sessions) {
    this.sessions = sessions;
  }

  public List<Session> currentSessions() {
    return Collections.unmodifiableList(this.sessions);
  }
}
