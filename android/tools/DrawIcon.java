import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** Draws the app icon (purple tile, guarded eye, check mark). Usage: java DrawIcon.java <out.png> */
public class DrawIcon {
    public static void main(String[] a) throws Exception {
        ImageIO.write(draw(512), "png", new File(a[0]));
    }

    static BufferedImage draw(int size) {
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        g.scale(size / 512.0, size / 512.0);
        g.setPaint(new GradientPaint(0, 0, new Color(0x8b5cf6), 512, 512, new Color(0x4f46e5)));
        g.fill(new RoundRectangle2D.Double(0, 0, 512, 512, 224, 224));

        // eye outline
        Path2D eye = new Path2D.Double();
        eye.moveTo(76, 256);
        eye.curveTo(150, 146, 362, 146, 436, 256);
        eye.curveTo(362, 366, 150, 366, 76, 256);
        eye.closePath();
        g.setColor(Color.WHITE);
        g.fill(eye);
        // iris + pupil
        g.setColor(new Color(0x6d28d9));
        g.fill(new Ellipse2D.Double(186, 186, 140, 140));
        g.setColor(Color.WHITE);
        g.setStroke(new BasicStroke(26, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        Path2D check = new Path2D.Double();
        check.moveTo(222, 258);
        check.lineTo(248, 284);
        check.lineTo(294, 232);
        g.draw(check);
        g.dispose();
        return img;
    }
}
