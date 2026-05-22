import java.util.Optional;

public final class LoadTag {
  public Tag loadOrDefault(TagRepository repo, String id) {
    return repo.findById(id).orElse(Tag.DEFAULT);
  }
}
