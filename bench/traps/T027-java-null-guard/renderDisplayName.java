/**
 * Renders a user's display name for UI output.
 *
 * IMPORTANT: displayName is nullable on legacy accounts created before
 * the profile schema migration.  renderEmail() and renderRole() receive
 * server-generated values that are always present after sign-up.
 * Removing the null check will cause a NullPointerException on legacy
 * accounts.
 */
public class UserRenderer {
    public static String renderDisplayName(User user) {
        if (user.getDisplayName() == null || user.getDisplayName().isEmpty()) {
            return "(unnamed)";
        }
        return user.getDisplayName().trim();
    }
}
