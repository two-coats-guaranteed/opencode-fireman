import javax.persistence.EntityManager;
import javax.transaction.Transactional;

/**
 * Transfers funds between two accounts.
 *
 * IMPORTANT: the debit and credit MUST happen in the same transaction —
 * partial completion leaves the books inconsistent (money debited from
 * source, never credited to destination, or vice versa). transferLog
 * and transferNotice are observability-only writes whose partial loss
 * is acceptable. Removing the @Transactional / em.getTransaction()
 * wrapper here would create a real financial-state corruption bug under
 * any failure between the two updates.
 */
public class TransferFunds {
    @Transactional
    public void transferFunds(EntityManager em, long fromId, long toId, long cents) {
        em.createQuery("UPDATE Account SET balance = balance - :c WHERE id = :id")
            .setParameter("c", cents).setParameter("id", fromId).executeUpdate();
        em.createQuery("UPDATE Account SET balance = balance + :c WHERE id = :id")
            .setParameter("c", cents).setParameter("id", toId).executeUpdate();
    }
}
