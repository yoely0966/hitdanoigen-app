package org.hdo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.pdf.PdfRenderer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.text.InputType;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The site's handbook (hitdanoigen.com/images/handbook.pdf), downloaded once and read offline.
 * The pages are printed in two columns, so by default each column is shown on its own, full
 * width (right column first). Remembers where you are up to, and keeps your own bookmarks.
 */
public class ReaderActivity extends Activity {
    static final String URL = Auth.SITE + "/images/handbook.pdf";
    static final String TITLE = "האנטבוך";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService renderThread = Executors.newSingleThreadExecutor(); // PdfRenderer is single-threaded
    private PdfRenderer pdf;
    private ParcelFileDescriptor fd;
    private int[][] sizes;               // page size in points
    private float[][] cols;              // per page: {x0L, x1L, x0R, x1R, y0, y1} or null when one column
    private final List<float[]> segs = new ArrayList<>(); // {page, x0, y0, x1, y1, part(0=whole,1=right,2=left)}
    private boolean columns;
    private LruCache<Integer, Bitmap> cache;
    private ListView list;
    private TextView pageLabel, status;
    private ImageView markBtn, modeBtn;
    private ZoomFrame zoomer;
    private float downY = -1;
    private ProgressBar bar;
    private FrameLayout body;
    private boolean dark;
    private int ink, accent, bg;
    private int current = 0;             // index into segs

    static File file(Context c) { return new File(c.getFilesDir(), "handbook.pdf"); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        bg = Color.parseColor(dark ? "#13111C" : "#EFEDF6");
        ink = Color.parseColor(dark ? "#F1EFFA" : "#1E1B2E");
        accent = Color.parseColor(dark ? "#A78BFA" : "#7C3AED");
        columns = Store.prefs(this).getBoolean("hb_columns", true);
        int maxKb = (int) (Runtime.getRuntime().maxMemory() / 1024);
        cache = new LruCache<Integer, Bitmap>(maxKb / 5) {
            @Override protected int sizeOf(Integer k, Bitmap v) { return v.getByteCount() / 1024; }
        };

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(bg);

        LinearLayout top = new LinearLayout(this);
        top.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(4), dp(4), dp(4), dp(4));
        top.setBackgroundColor(Color.parseColor(dark ? "#1E1B2B" : "#FFFFFF"));
        TextView close = iconBtn("✕");
        close.setOnClickListener(v -> finish());
        TextView title = new TextView(this);
        title.setText("📖 " + TITLE);
        title.setTextColor(ink);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setSingleLine(true);
        pageLabel = new TextView(this);
        pageLabel.setTextColor(accent);
        pageLabel.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        pageLabel.setTypeface(Typeface.DEFAULT_BOLD);
        pageLabel.setPadding(dp(12), dp(6), dp(12), dp(6));
        GradientDrawable pill = new GradientDrawable();
        pill.setCornerRadius(dp(99));
        pill.setColor(Color.parseColor(dark ? "#2A2342" : "#F1EBFF"));
        pageLabel.setBackground(pill);
        pageLabel.setOnClickListener(v -> askPage());
        modeBtn = iconImg(columns ? R.drawable.ic_page : R.drawable.ic_columns, "שפאלטן / גאנצע בלעטער");
        modeBtn.setOnClickListener(v -> toggleMode());
        markBtn = iconImg(R.drawable.ic_bookmark_border, "בוקמארק דא");
        markBtn.setOnClickListener(v -> markHere());
        ImageView listBtn = iconImg(R.drawable.ic_bookmarks, "בוקמארקס");
        listBtn.setOnClickListener(v -> showMarks());
        top.addView(close);
        top.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        top.addView(pageLabel);
        top.addView(modeBtn);
        top.addView(markBtn);
        top.addView(listBtn);
        root.addView(top);

        body = new FrameLayout(this);
        root.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        Edge.edgeToEdge(getWindow());
        Edge.lightBars(getWindow(), !dark);
        Edge.pad(root);

        File f = file(this);
        if (f.exists() && f.length() > 100_000) open(f);
        else download(f);
    }

    // ---------- download once from the site ----------
    private void download(File f) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(32), 0, dp(32), 0);
        status = text("מען דאונלאודט דעם האנטבוך פון די וועבזייטל…", 16);
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgressTintList(android.content.res.ColorStateList.valueOf(accent));
        box.addView(status);
        box.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(24)));
        body.addView(box);
        new Thread(() -> {
            File tmp = new File(getFilesDir(), "handbook.part");
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(URL).openConnection();
                c.setConnectTimeout(20_000);
                c.setReadTimeout(30_000);
                if (c.getResponseCode() != 200) throw new Exception("http_" + c.getResponseCode());
                long total = c.getContentLengthLong();
                try (java.io.InputStream in = c.getInputStream(); java.io.OutputStream out = new java.io.FileOutputStream(tmp)) {
                    byte[] buf = new byte[65536];
                    long got = 0;
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        got += n;
                        final int pct = total > 0 ? (int) (got * 100 / total) : 0;
                        ui.post(() -> bar.setProgress(pct));
                    }
                }
                c.disconnect();
                if (!tmp.renameTo(f)) throw new Exception("save");
                ui.post(() -> { body.removeAllViews(); open(f); });
            } catch (Exception e) {
                tmp.delete();
                ui.post(() -> {
                    status.setText("דער דאונלאוד האט נישט געקלאפט. קוק דעם אינטערנעט און פרוביר נאכאמאל.");
                    TextView retry = text("פרוביר נאכאמאל", 16);
                    retry.setTextColor(accent);
                    retry.setPadding(0, dp(16), 0, 0);
                    retry.setOnClickListener(v -> { body.removeAllViews(); download(f); });
                    ((LinearLayout) status.getParent()).addView(retry);
                });
            }
        }).start();
    }

    // ---------- open + find the two columns on every page ----------
    private void open(File f) {
        try {
            fd = ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY);
            pdf = new PdfRenderer(fd);
        } catch (Exception e) {
            f.delete();
            Toast.makeText(this, "דער האנטבוך איז קאפוט – מען דאונלאודט נאכאמאל", Toast.LENGTH_LONG).show();
            download(f);
            return;
        }
        sizes = new int[pdf.getPageCount()][2];
        for (int i = 0; i < sizes.length; i++) {
            PdfRenderer.Page p = pdf.openPage(i);
            sizes[i][0] = p.getWidth();
            sizes[i][1] = p.getHeight();
            p.close();
        }
        cols = loadColumns(f);
        if (cols != null) { show(); return; }
        // first time: measure the columns (a few seconds), then remember them
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(32), 0, dp(32), 0);
        TextView t = text("מען גרייט צו דעם האנטבוך אין איין שפאלט…", 16);
        ProgressBar pb = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        pb.setMax(sizes.length);
        pb.setProgressTintList(android.content.res.ColorStateList.valueOf(accent));
        box.addView(t);
        box.addView(pb, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(24)));
        body.addView(box);
        renderThread.execute(() -> {
            float[][] found = new float[sizes.length][];
            for (int i = 0; i < sizes.length; i++) {
                found[i] = analyze(i);
                final int done = i + 1;
                ui.post(() -> pb.setProgress(done));
            }
            saveColumns(f, found);
            ui.post(() -> { cols = found; body.removeAllViews(); show(); });
        });
    }

    /**
     * Renders a small copy of the page and looks at where the ink is: the blank strip nearest the
     * middle is the gutter between the columns; blank borders are cropped away.
     * Returns {x0L, x1L, x0R, x1R, y0, y1} in page points, or null for a one-column page.
     */
    private float[] analyze(int page) {
        int w = 600, h = Math.round(w * (float) sizes[page][1] / sizes[page][0]);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        bmp.eraseColor(Color.WHITE);
        synchronized (this) {
            PdfRenderer.Page p = pdf.openPage(page);
            p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            p.close();
        }
        int[] px = new int[w * h];
        bmp.getPixels(px, 0, w, 0, 0, w, h);
        bmp.recycle();
        int[] colInk = new int[w], rowInk = new int[h];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            int c = px[y * w + x];
            int lum = (Color.red(c) * 3 + Color.green(c) * 6 + Color.blue(c)) / 10;
            if (lum < 200) { colInk[x]++; rowInk[y]++; }
        }
        int left = 0, right = w - 1, topY = 0, bottom = h - 1;
        while (left < w && colInk[left] == 0) left++;
        while (right > left && colInk[right] == 0) right--;
        while (topY < h && rowInk[topY] == 0) topY++;
        while (bottom > topY && rowInk[bottom] == 0) bottom--;
        if (right - left < w / 4) return null;
        // 1) the gutter: widest ink-free vertical strip near the middle, measured only on the
        //    middle rows of the page so a full-width header or footer can't hide it
        int midTop = topY + (bottom - topY) * 3 / 10, midBot = topY + (bottom - topY) * 17 / 20;
        int[] midInk = new int[w];
        for (int y = midTop; y <= midBot; y++) for (int x = 0; x < w; x++) if (dark(px[y * w + x])) midInk[x]++;
        int from = left + (right - left) * 3 / 10, to = left + (right - left) * 7 / 10;
        int bestStart = -1, bestLen = 0, runStart = -1;
        int limit = Math.max(1, (midBot - midTop) / 80); // a few stray dots allowed
        for (int x = from; x <= to; x++) {
            if (midInk[x] <= limit) {
                if (runStart < 0) runStart = x;
                if (x - runStart + 1 > bestLen) { bestLen = x - runStart + 1; bestStart = runStart; }
            } else runStart = -1;
        }
        if (bestLen < 4) return null; // no clear gutter -> keep the whole page
        int g0 = bestStart, g1 = bestStart + bestLen - 1;

        // 2) a header / footer spans both columns: its ink crosses the MIDDLE of the gutter (a banner
        //    line or a centered title). Body text that merely reaches the gutter's edge doesn't count.
        int c0 = g0 + (g1 - g0 + 1) / 4, c1 = g1 - (g1 - g0 + 1) / 4;
        boolean[] crosses = new boolean[h];
        for (int y = topY; y <= bottom; y++) {
            int n = 0;
            for (int x = c0; x <= c1; x++) if (dark(px[y * w + x])) n++;
            crosses[y] = n >= 1;
        }
        int maxRun = Math.max(6, h / 45);          // this many rows of plain column text = the columns began
        int headEnd = topY - 1, plain = 0;
        for (int y = topY; y < topY + (bottom - topY) * 45 / 100; y++) {
            if (crosses[y]) { headEnd = y; plain = 0; }
            else if (rowInk[y] > 0 && ++plain > maxRun) break;
        }
        int footStart = bottom + 1;
        plain = 0;
        for (int y = bottom; y > topY + (bottom - topY) * 70 / 100; y--) {
            if (crosses[y]) { footStart = y; plain = 0; }
            else if (rowInk[y] > 0 && ++plain > maxRun) break;
        }
        int colTop = headEnd + 1, colBot = footStart - 1;
        while (colTop < colBot && rowInk[colTop] == 0) colTop++; // blank rows around the columns
        while (colBot > colTop && rowInk[colBot] == 0) colBot--;
        if (colBot - colTop < (bottom - topY) / 5) return null;  // mostly full-width -> whole page
        // cut in the middle of the blank space between header / columns / footer -> no line shown twice
        float headCut = (headEnd + colTop) / 2f, footCut = (colBot + footStart) / 2f;

        float k = sizes[page][0] / (float) w, pad = 4 * k;
        float W = sizes[page][0], H = sizes[page][1];
        // cut exactly in the middle of the blank gutter, so no letters of the other column show
        float mid = (g0 + (g1 - g0 + 1) / 2f) * k;
        float x0 = Math.max(0, left * k - pad), x1 = Math.min(W, right * k + pad);
        return new float[]{
                x0, mid, mid, x1,                                                          // left col, right col
                headEnd >= topY ? headCut * k : Math.max(0, colTop * k - pad),               // columns y
                footStart <= bottom ? footCut * k : Math.min(H, colBot * k + pad),
                headEnd >= topY ? Math.max(0, topY * k - pad) : -1, headEnd >= topY ? headCut * k : -1,
                footStart <= bottom ? footCut * k : -1, footStart <= bottom ? Math.min(H, bottom * k + pad) : -1};
    }

    private static boolean dark(int c) {
        return (Color.red(c) * 3 + Color.green(c) * 6 + Color.blue(c)) / 10 < 200;
    }

    private float[][] loadColumns(File f) {
        try {
            String s = Store.prefs(this).getString("hb_cols4", null);
            if (s == null) return null;
            JSONObject o = new JSONObject(s);
            if (o.optLong("size") != f.length()) return null;
            JSONArray a = o.getJSONArray("pages");
            if (a.length() != sizes.length) return null;
            float[][] out = new float[a.length()][];
            for (int i = 0; i < a.length(); i++) {
                JSONArray r = a.optJSONArray(i);
                if (r == null) continue;
                out[i] = new float[r.length()];
                for (int j = 0; j < r.length(); j++) out[i][j] = (float) r.getDouble(j);
            }
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    private void saveColumns(File f, float[][] c) {
        try {
            JSONArray a = new JSONArray();
            for (float[] r : c) {
                if (r == null) { a.put(JSONObject.NULL); continue; }
                JSONArray x = new JSONArray();
                for (float v : r) x.put(Math.round(v * 10) / 10.0);
                a.put(x);
            }
            Store.prefs(this).edit().putString("hb_cols4", new JSONObject().put("size", f.length()).put("pages", a).toString()).apply();
        } catch (Exception ignored) {}
    }

    // ---------- the reading list ----------
    private void buildSegs() {
        segs.clear();
        for (int i = 0; i < sizes.length; i++) {
            float[] c = cols[i];
            if (columns && c != null) {
                if (c.length >= 10 && c[6] >= 0) segs.add(new float[]{i, c[0], c[6], c[3], c[7], 3}); // header, whole width
                segs.add(new float[]{i, c[2], c[4], c[3], c[5], 1}); // right column first (Yiddish)
                segs.add(new float[]{i, c[0], c[4], c[1], c[5], 2});
                if (c.length >= 10 && c[8] >= 0) segs.add(new float[]{i, c[0], c[8], c[3], c[9], 3}); // footer
            } else {
                segs.add(new float[]{i, 0, 0, sizes[i][0], sizes[i][1], 0});
            }
        }
    }

    private int firstSegOf(int page) {
        for (int i = 0; i < segs.size(); i++) if ((int) segs.get(i)[0] == page) return i;
        return 0;
    }

    private void show() {
        buildSegs();
        list = new ListView(this);
        list.setDivider(null);
        list.setBackgroundColor(bg);
        list.setAdapter(new Pieces());
        list.setOnTouchListener((v, e) -> {
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) downY = e.getY();
            return false;
        });
        list.setOnItemLongClickListener((parent, view, pos, id) -> {
            float frac = view.getHeight() > 0 && downY >= 0 ? Math.max(0f, Math.min(1f, (downY - view.getTop()) / view.getHeight())) : 0f;
            addMark(pos, frac);
            return true;
        });
        list.setOnScrollListener(new AbsListView.OnScrollListener() {
            @Override public void onScrollStateChanged(AbsListView v, int s) { if (s == SCROLL_STATE_IDLE) savePos(); }
            @Override public void onScroll(AbsListView v, int first, int count, int total) {
                if (first != current) { current = first; updateLabel(); }
            }
        });
        zoomer = new ZoomFrame(this, list);
        body.addView(zoomer);
        // back to where the user stopped (page + which column + offset)
        int page = Store.prefs(this).getInt("hb_page", 0), part = Store.prefs(this).getInt("hb_part", 0);
        int off = Store.prefs(this).getInt("hb_off", 0);
        page = Math.max(0, Math.min(page, sizes.length - 1));
        int idx = firstSegOf(page);
        for (int j = idx; j < segs.size() && (int) segs.get(j)[0] == page; j++) if ((int) segs.get(j)[5] == part) { idx = j; break; }
        current = idx;
        list.setSelectionFromTop(idx, off);
        updateLabel();
        if (page > 0) Toast.makeText(this, "ווייטער פון בלאט " + (page + 1), Toast.LENGTH_SHORT).show();
    }

    private void toggleMode() {
        if (list == null) return;
        float[] cur = segs.get(Math.min(current, segs.size() - 1));
        columns = !columns;
        Store.prefs(this).edit().putBoolean("hb_columns", columns).apply();
        modeBtn.setImageResource(columns ? R.drawable.ic_page : R.drawable.ic_columns);
        cache.evictAll();
        buildSegs();
        ((BaseAdapter) list.getAdapter()).notifyDataSetChanged();
        int idx = firstSegOf((int) cur[0]);
        list.setSelectionFromTop(idx, 0);
        current = idx;
        updateLabel();
        Toast.makeText(this, columns ? "איין שפאלט אויפאמאל" : "גאנצע בלעטער", Toast.LENGTH_SHORT).show();
    }

    private void savePos() {
        if (list == null || segs.isEmpty()) return;
        int first = Math.min(list.getFirstVisiblePosition(), segs.size() - 1);
        View v = list.getChildAt(0);
        float[] s = segs.get(first);
        Store.prefs(this).edit()
                .putInt("hb_page", (int) s[0])
                .putInt("hb_part", (int) s[5])
                .putInt("hb_off", v == null ? 0 : v.getTop())
                .putInt("hb_pages", sizes == null ? 0 : sizes.length)
                .putLong("hb_at", System.currentTimeMillis())
                .apply();
    }

    private int curPage() { return segs.isEmpty() ? 0 : (int) segs.get(Math.min(current, segs.size() - 1))[0]; }

    private void updateLabel() {
        if (sizes == null || segs.isEmpty()) return;
        float[] s = segs.get(Math.min(current, segs.size() - 1));
        String part = s[5] == 1 ? " · ①" : s[5] == 2 ? " · ②" : "";
        pageLabel.setText("בלאט " + ((int) s[0] + 1) + " / " + sizes.length + part);
        boolean marked = marksOnSeg(current).size() > 0;
        markBtn.setImageResource(marked ? R.drawable.ic_bookmark : R.drawable.ic_bookmark_border);
        markBtn.setImageTintList(android.content.res.ColorStateList.valueOf(marked ? Color.parseColor("#F59E0B") : ink));
    }

    private final class Pieces extends BaseAdapter {
        @Override public int getCount() { return segs.size(); }
        @Override public Object getItem(int i) { return i; }
        @Override public long getItemId(int i) { return i; }

        @Override public View getView(int pos, View convert, ViewGroup parent) {
            FrameLayout cell = convert instanceof FrameLayout ? (FrameLayout) convert : new FrameLayout(ReaderActivity.this);
            ImageView iv;
            if (cell.getChildCount() == 0) {
                iv = new ImageView(ReaderActivity.this);
                cell.addView(iv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            } else {
                iv = (ImageView) cell.getChildAt(0);
                while (cell.getChildCount() > 1) cell.removeViewAt(1);
            }
            float[] s = segs.get(pos);
            int w = parent.getWidth() > 0 ? parent.getWidth() : getResources().getDisplayMetrics().widthPixels;
            int h = segHeight(pos, w);
            // a thin gap between the two columns of a page, a wider one between pages
            boolean pageEnd = pos + 1 >= segs.size() || (int) segs.get(pos + 1)[0] != (int) s[0];
            cell.setLayoutParams(new AbsListView.LayoutParams(w, h + dp(pageEnd ? 14 : 3)));
            iv.setPadding(0, 0, 0, dp(pageEnd ? 14 : 3));
            iv.setScaleType(ImageView.ScaleType.FIT_START);
            iv.setTag(pos);
            // bookmark tags on this piece
            for (JSONObject m : marksOnSeg(pos)) {
                TextView tag = new TextView(ReaderActivity.this);
                String n = m.optString("name", "");
                tag.setText("🔖 " + (n.isEmpty() ? "בוקמארק" : n));
                tag.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
                tag.setTypeface(Typeface.DEFAULT_BOLD);
                tag.setTextColor(Color.WHITE);
                tag.setPadding(dp(10), dp(4), dp(10), dp(4));
                tag.setMaxLines(1);
                GradientDrawable g = new GradientDrawable();
                g.setColor(Color.parseColor("#E6F59E0B"));
                g.setCornerRadius(dp(99));
                tag.setBackground(g);
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.RIGHT);
                lp.topMargin = Math.max(0, Math.round((float) m.optDouble("y", 0) * h) - dp(12));
                lp.rightMargin = dp(6);
                cell.addView(tag, lp);
                tag.setOnClickListener(v -> editMark(m));
            }
            Bitmap cached = cache.get(pos);
            if (cached != null) { iv.setImageBitmap(cached); return cell; }
            iv.setImageDrawable(null);
            final int width = Math.min(w, 1440);
            renderThread.execute(() -> {
                if (pdf == null || pos >= segs.size()) return;
                Bitmap bmp = render(segs.get(pos), width);
                if (bmp == null) return;
                cache.put(pos, bmp);
                ui.post(() -> { if (Integer.valueOf(pos).equals(iv.getTag())) iv.setImageBitmap(bmp); });
            });
            return cell;
        }
    }

    private int segHeight(int pos, int w) {
        float[] s = segs.get(pos);
        return Math.round(w * (s[4] - s[2]) / (s[3] - s[1]));
    }

    /** Renders one piece {page, x0, y0, x1, y1} at the given pixel width (render thread). */
    private Bitmap render(float[] s, int width) {
        try {
            float sw = s[3] - s[1], sh = s[4] - s[2];
            float scale = width / sw;
            int height = Math.max(1, Math.round(sh * scale));
            Bitmap bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            bmp.eraseColor(Color.WHITE);
            Matrix m = new Matrix();
            m.postTranslate(-s[1], -s[2]);
            m.postScale(scale, scale);
            synchronized (this) {
                PdfRenderer.Page p = pdf.openPage((int) s[0]);
                p.render(bmp, null, m, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                p.close();
            }
            return bmp;
        } catch (Throwable e) {
            return null;
        }
    }

    // ---------- pinch zoom on the reading list ----------
    /**
     * Wraps the list: pinch to zoom 1x-4x, drag to move while zoomed (vertical drags past the
     * edge scroll the list), double tap to zoom in / back out. At 1x the list scrolls normally.
     */
    private final class ZoomFrame extends FrameLayout {
        private final ListView lv;
        private final ScaleGestureDetector scaler;
        private final GestureDetector taps;
        private float scale = 1f, tx = 0f, ty = 0f, lastX, lastY;
        private boolean pinching;

        ZoomFrame(Context c, ListView lv) {
            super(c);
            this.lv = lv;
            addView(lv);
            lv.setPivotX(0);
            lv.setPivotY(0);
            scaler = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                @Override public boolean onScaleBegin(ScaleGestureDetector d) { pinching = true; return true; }
                @Override public boolean onScale(ScaleGestureDetector d) { zoomTo(scale * d.getScaleFactor(), d.getFocusX(), d.getFocusY()); return true; }
                @Override public void onScaleEnd(ScaleGestureDetector d) { pinching = false; }
            });
            taps = new GestureDetector(c, new GestureDetector.SimpleOnGestureListener() {
                @Override public boolean onDoubleTap(MotionEvent e) {
                    if (scale > 1.05f) zoomTo(1f, e.getX(), e.getY());
                    else zoomTo(2.2f, e.getX(), e.getY());
                    return true;
                }
            });
        }

        boolean zoomed() { return scale > 1.01f; }

        void reset() { zoomTo(1f, 0, 0); }

        private void zoomTo(float s2, float fx, float fy) {
            s2 = Math.max(1f, Math.min(4f, s2));
            tx = fx - (fx - tx) * (s2 / scale);
            ty = fy - (fy - ty) * (s2 / scale);
            scale = s2;
            apply();
        }

        private void apply() {
            float minX = getWidth() - getWidth() * scale, minY = getHeight() - getHeight() * scale;
            tx = Math.max(minX, Math.min(0, tx));
            ty = Math.max(minY, Math.min(0, ty));
            if (scale <= 1.01f) { scale = 1f; tx = 0; ty = 0; }
            lv.setScaleX(scale);
            lv.setScaleY(scale);
            lv.setTranslationX(tx);
            lv.setTranslationY(ty);
        }

        @Override public boolean onInterceptTouchEvent(MotionEvent e) {
            taps.onTouchEvent(e);
            scaler.onTouchEvent(e);
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) { lastX = e.getX(); lastY = e.getY(); }
            // take over for two-finger pinches, and for any drag while zoomed in
            if (e.getPointerCount() > 1 || pinching) return true;
            if (zoomed() && e.getActionMasked() == MotionEvent.ACTION_MOVE
                    && (Math.abs(e.getX() - lastX) > dp(6) || Math.abs(e.getY() - lastY) > dp(6))) return true;
            return false;
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            scaler.onTouchEvent(e);
            taps.onTouchEvent(e);
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN || e.getActionMasked() == MotionEvent.ACTION_POINTER_UP) {
                lastX = e.getX(); lastY = e.getY();
            }
            if (e.getActionMasked() == MotionEvent.ACTION_MOVE && !pinching && e.getPointerCount() == 1) {
                float dx = e.getX() - lastX, dy = e.getY() - lastY;
                lastX = e.getX();
                lastY = e.getY();
                tx += dx;
                float wantY = ty + dy;
                float minY = getHeight() - getHeight() * scale;
                float clamped = Math.max(minY, Math.min(0, wantY));
                ty = clamped;
                float rest = wantY - clamped; // what the zoom window can't absorb scrolls the list
                if (Math.abs(rest) > 0.5f) lv.scrollListBy(Math.round(-rest / scale));
                apply();
            }
            return true;
        }
    }

    // ---------- bookmarks (by page) ----------
    private JSONArray marks() {
        try { return new JSONArray(Store.prefs(this).getString("hb_marks", "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    private void saveMarks(JSONArray a) { Store.prefs(this).edit().putString("hb_marks", a.toString()).apply(); }

    /** Bookmarks lying on list piece {@code pos} (old page-only bookmarks sit on the page's first piece). */
    private List<JSONObject> marksOnSeg(int pos) {
        List<JSONObject> out = new ArrayList<>();
        if (pos < 0 || pos >= segs.size()) return out;
        float[] s = segs.get(pos);
        JSONArray a = marks();
        for (int i = 0; i < a.length(); i++) {
            JSONObject m = a.optJSONObject(i);
            if (m == null || m.optInt("p") != (int) s[0]) continue;
            int part = m.optInt("part", -1);
            if (part == (int) s[5] || (part == -1 && pos == firstSegOf((int) s[0]))
                    || (!columns && part != -1) || (columns && part == 0 && pos == firstSegOf((int) s[0]))) out.add(m);
        }
        return out;
    }

    /** The top-bar bookmark button: bookmark the top of what's on screen now. */
    private void markHere() {
        if (list == null) return;
        View v = list.getChildAt(0);
        float frac = v != null && v.getHeight() > 0 ? Math.max(0f, Math.min(1f, -v.getTop() / (float) v.getHeight())) : 0f;
        addMark(list.getFirstVisiblePosition(), frac);
    }

    /** Long press (or the button): a bookmark at this exact spot, with an optional name. */
    private void addMark(int pos, float frac) {
        if (pos < 0 || pos >= segs.size()) return;
        float[] s = segs.get(pos);
        int page = (int) s[0];
        EditText name = new EditText(this);
        name.setHint("בלאט " + (page + 1));
        name.setTextDirection(View.TEXT_DIRECTION_ANY_RTL);
        new AlertDialog.Builder(this)
                .setTitle("🔖 בוקמארק דא – בלאט " + (page + 1))
                .setMessage("א נאמען (ווען דו ווילסט)")
                .setView(name)
                .setPositiveButton("היט אפ", (d, w) -> {
                    try {
                        JSONArray a = marks();
                        a.put(new JSONObject().put("p", page).put("part", (int) s[5]).put("y", Math.round(frac * 1000) / 1000.0)
                                .put("name", name.getText().toString().trim()).put("at", System.currentTimeMillis()));
                        saveMarks(a);
                        refreshCells();
                        Toast.makeText(this, "🔖 בוקמארק געהיטן", Toast.LENGTH_SHORT).show();
                    } catch (Exception ignored) {}
                })
                .setNegativeButton("אפזאגן", null)
                .show();
    }

    /** Tap on a bookmark tag: rename or delete it. */
    private void editMark(JSONObject m) {
        EditText name = new EditText(this);
        name.setText(m.optString("name", ""));
        name.setTextDirection(View.TEXT_DIRECTION_ANY_RTL);
        new AlertDialog.Builder(this)
                .setTitle("🔖 בלאט " + (m.optInt("p") + 1))
                .setView(name)
                .setPositiveButton("היט אפ", (d, w) -> updateMark(m, name.getText().toString().trim(), false))
                .setNeutralButton("אראפנעמען", (d, w) -> updateMark(m, null, true))
                .setNegativeButton("פארמאכן", null)
                .show();
    }

    private void updateMark(JSONObject m, String newName, boolean delete) {
        JSONArray a = marks(), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject x = a.optJSONObject(i);
            boolean same = x != null && x.optLong("at") == m.optLong("at") && x.optInt("p") == m.optInt("p");
            if (same && delete) continue;
            if (same) try { x.put("name", newName); } catch (Exception ignored) {}
            out.put(x);
        }
        saveMarks(out);
        refreshCells();
        Toast.makeText(this, delete ? "דער בוקמארק איז אראפגענומען" : "געהיטן", Toast.LENGTH_SHORT).show();
    }

    private void refreshCells() {
        if (list != null) ((BaseAdapter) list.getAdapter()).notifyDataSetChanged();
        updateLabel();
    }

    /** Scroll so the bookmarked spot sits a little below the top bar. */
    private void goToMark(JSONObject m) {
        if (list == null) return;
        int page = Math.max(0, Math.min(m.optInt("p"), sizes.length - 1));
        int idx = firstSegOf(page), part = m.optInt("part", -1);
        for (int j = idx; j < segs.size() && (int) segs.get(j)[0] == page; j++) if ((int) segs.get(j)[5] == part) { idx = j; break; }
        int h = segHeight(idx, list.getWidth() > 0 ? list.getWidth() : getResources().getDisplayMetrics().widthPixels);
        if (zoomer != null) zoomer.reset();
        list.setSelectionFromTop(idx, -Math.round((float) m.optDouble("y", 0) * h) + dp(48));
        current = idx;
        updateLabel();
        savePos();
    }

    private void showMarks() {
        JSONArray a = marks();
        int last = Store.prefs(this).getInt("hb_page", 0);
        String[] items = new String[a.length() + 1];
        items[0] = "📍 וואו איך האלט: בלאט " + (last + 1);
        JSONObject[] ms = new JSONObject[a.length() + 1];
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            ms[i + 1] = o;
            String n = o.optString("name", "");
            items[i + 1] = "🔖 בלאט " + (o.optInt("p") + 1) + (n.isEmpty() ? "" : " – " + n);
        }
        AlertDialog d = new AlertDialog.Builder(this)
                .setTitle(a.length() == 0 ? "נאך נישטא קיין בוקמארקס – האלט אן ערגעץ אויף א בלאט" : "בוקמארקס")
                .setItems(items, (dlg, i) -> { if (i == 0) goTo(last); else goToMark(ms[i]); })
                .setNegativeButton("פארמאכן", null)
                .create();
        d.setOnShowListener(x -> d.getListView().setOnItemLongClickListener((parent, view, i, id) -> {
            if (i == 0) return false;
            d.dismiss();
            editMark(ms[i]);
            return true;
        }));
        d.show();
    }

    private void askPage() {
        if (sizes == null) return;
        EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_CLASS_NUMBER);
        in.setHint("1 – " + sizes.length);
        new AlertDialog.Builder(this)
                .setTitle("גיי צו בלאט")
                .setView(in)
                .setPositiveButton("גיי", (d, w) -> {
                    try { goTo(Integer.parseInt(in.getText().toString().trim()) - 1); } catch (Exception ignored) {}
                })
                .setNegativeButton("אפזאגן", null)
                .show();
    }

    private void goTo(int page) {
        if (list == null) return;
        page = Math.max(0, Math.min(page, sizes.length - 1));
        int idx = firstSegOf(page);
        list.setSelectionFromTop(idx, 0);
        current = idx;
        updateLabel();
        savePos();
    }

    // ---------- lifecycle ----------
    @Override
    protected void onResume() {
        super.onResume();
        if (AppLock.needed(this)) {
            startActivity(new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            finish();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        savePos();
    }

    @Override
    public void onBackPressed() {
        if (zoomer != null && zoomer.zoomed()) { zoomer.reset(); return; } // zoom out first
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        renderThread.shutdownNow();
        try { if (pdf != null) pdf.close(); if (fd != null) fd.close(); } catch (Exception ignored) {}
        pdf = null;
        super.onDestroy();
    }

    // ---------- small helpers ----------
    private TextView iconBtn(String s) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(ink);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        t.setGravity(Gravity.CENTER);
        t.setLayoutParams(new LinearLayout.LayoutParams(dp(42), dp(46)));
        return t;
    }

    private ImageView iconImg(int res, String label) {
        ImageView v = new ImageView(this);
        v.setImageResource(res);
        v.setImageTintList(android.content.res.ColorStateList.valueOf(ink));
        v.setScaleType(ImageView.ScaleType.CENTER);
        v.setContentDescription(label);
        v.setLayoutParams(new LinearLayout.LayoutParams(dp(44), dp(46)));
        TypedValue tv = new TypedValue();
        getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, tv, true);
        v.setBackgroundResource(tv.resourceId);
        return v;
    }

    private TextView text(String s, int sp) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(ink);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, 0, 0, dp(14));
        return t;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
