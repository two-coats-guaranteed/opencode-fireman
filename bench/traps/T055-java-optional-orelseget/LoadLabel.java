import java.util.Optional;

public final class LoadLabel {
  public Label loadOrDefault(LabelRepository repo, String id) {
    return repo.findById(id).orElse(Label.EMPTY);
  }
}
