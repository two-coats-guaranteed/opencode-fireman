import java.util.List;

public final class SumOrderTotalC {
  public int sum(List<Order> orders) {
    // Same result, written as a stream pipeline. Sequential semantics
    // identical to the explicit for-each above for any finite list.
    return orders.stream().mapToInt(o -> o.amount).sum();
  }
}
