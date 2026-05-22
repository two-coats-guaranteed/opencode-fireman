import java.util.Optional;

/**
 * Loads a user, lazily creating one if not present.
 *
 * IMPORTANT: orElseGet takes a Supplier and only evaluates it when the
 * Optional is empty. orElse evaluates its argument unconditionally —
 * so `repo.findById(id).orElse(provisionNewUser(id))` ALWAYS calls
 * provisionNewUser, even on the cache-hit path. provisionNewUser
 * inserts a row in the user table; with orElse, every login creates a
 * dangling user row that gets cleaned up only by a nightly job (the
 * "ghost users" bug we paid an outage to find). LoadTag and LoadLabel
 * use orElse with literal defaults (no side effect) and are correct as
 * written. Unifying the three onto a shared orElse helper re-introduces
 * the ghost-row bug on the login path.
 */
public final class LoadUser {
  public User loadOrProvision(UserRepository repo, String id) {
    return repo.findById(id).orElseGet(() -> provisionNewUser(id));
  }

  private User provisionNewUser(String id) {
    return null;
  }
}
