import java.util.List;

public final class MetricStore {
  private final List<Metric> metrics;

  public MetricStore(List<Metric> metrics) {
    this.metrics = metrics;
  }

  public List<Metric> currentMetrics() {
    return this.metrics;
  }
}
