import java.io.BufferedReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ReadTraceFile {
  public String firstLine(Path p) throws IOException {
    BufferedReader r = Files.newBufferedReader(p);
    return r.readLine();
  }
}
