import java.awt.*;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/**
 * Launcher icon for older phones (Android 7; newer ones use the vector adaptive icon):
 * the site's own logo (tools/brand/apple-touch-icon.png) on a white rounded tile.
 * Usage: java DrawIcon.java <out.png>
 */
public class DrawIcon {
    public static void main(String[] a) throws Exception {
        File logo = new File(a.length > 1 ? a[1] : "tools/brand/apple-touch-icon.png");
        BufferedImage src = ImageIO.read(logo);
        int size = 512;
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setColor(Color.WHITE);
        g.fill(new RoundRectangle2D.Double(0, 0, size, size, 224, 224));
        int s = 380;
        g.drawImage(src, (size - s) / 2, (size - s) / 2, s, s, null);
        g.dispose();
        ImageIO.write(img, "png", new File(a[0]));
    }
}
