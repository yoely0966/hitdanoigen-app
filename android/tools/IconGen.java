import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/**
 * Generates launcher mipmaps from a square source PNG.
 * Usage: java IconGen.java <source.png> <res-dir>
 * Downscales in halving steps (bilinear) for good quality, then a final bicubic step.
 */
public class IconGen {
    public static void main(String[] args) throws Exception {
        BufferedImage src = ImageIO.read(new File(args[0]));
        File res = new File(args[1]);
        String[] names = {"mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"};
        int[] sizes = {48, 72, 96, 144, 192};
        for (int i = 0; i < names.length; i++) {
            File dir = new File(res, "mipmap-" + names[i]);
            dir.mkdirs();
            BufferedImage out = scale(src, sizes[i]);
            ImageIO.write(out, "png", new File(dir, "ic_launcher.png"));
            System.out.println("mipmap-" + names[i] + "/ic_launcher.png " + sizes[i] + "px");
        }
    }

    static BufferedImage scale(BufferedImage img, int target) {
        BufferedImage cur = toArgb(img);
        int w = cur.getWidth();
        while (w / 2 >= target) {
            w /= 2;
            cur = draw(cur, w, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        }
        if (w != target) cur = draw(cur, target, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        return cur;
    }

    static BufferedImage toArgb(BufferedImage img) {
        if (img.getType() == BufferedImage.TYPE_INT_ARGB) return img;
        return draw(img, img.getWidth(), RenderingHints.VALUE_INTERPOLATION_BILINEAR);
    }

    static BufferedImage draw(BufferedImage img, int size, Object interp) {
        BufferedImage out = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, interp);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.drawImage(img, 0, 0, size, size, null);
        g.dispose();
        return out;
    }
}
