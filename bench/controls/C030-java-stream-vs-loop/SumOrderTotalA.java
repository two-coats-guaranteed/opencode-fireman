import java.util.List;

public final class SumOrderTotalA {
  public int sum(List<Order> orders) {
    int total = 0;
    for (Order o : orders) {
      total += o.amount;
    }
    return total;
  }
}
