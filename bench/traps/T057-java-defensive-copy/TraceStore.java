import java.util.List;

public final class TraceStore {
  private final List<Trace> traces;

  public TraceStore(List<Trace> traces) {
    this.traces = traces;
  }

  public List<Trace> currentTraces() {
    return this.traces;
  }
}
