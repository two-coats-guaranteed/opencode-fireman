import javax.persistence.EntityManager;

public class TransferNotice {
    public void transferNotice(EntityManager em, long fromId, long toId, long cents) {
        em.createQuery("UPDATE Account SET notice_at = NOW() WHERE id = :id")
            .setParameter("id", fromId).executeUpdate();
        em.createQuery("UPDATE Account SET notice_at = NOW() WHERE id = :id")
            .setParameter("id", toId).executeUpdate();
    }
}
