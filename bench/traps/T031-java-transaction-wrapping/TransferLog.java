import javax.persistence.EntityManager;

public class TransferLog {
    public void transferLog(EntityManager em, long fromId, long toId, long cents) {
        em.createQuery("UPDATE Account SET last_debit_at = NOW() WHERE id = :id")
            .setParameter("id", fromId).executeUpdate();
        em.createQuery("UPDATE Account SET last_credit_at = NOW() WHERE id = :id")
            .setParameter("id", toId).executeUpdate();
    }
}
