import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Reads the first line of a billing reconciliation file.
 *
 * IMPORTANT: billing files live on a low-quota shared filesystem with
 * a hard cap on open file handles. Try-with-resources guarantees the
 * BufferedReader is closed even on exception; manual close in finally
 * is correct only if you remember to use it. ReadMetricFile and
 * ReadTraceFile read from a tmpfs that's recycled each run — file
 * handles there die with the process. Unifying the three onto a shared
 * helper that drops try-with-resources re-introduces the EMFILE
 * outage on the billing path.
 */
public final class ReadBillingFile {
  public String firstLine(Path p) throws IOException {
    try (BufferedReader r = Files.newBufferedReader(p)) {
      return r.readLine();
    }
  }
}
