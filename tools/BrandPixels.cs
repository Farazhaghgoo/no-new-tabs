// Pixel helpers for tools/export-brand.ps1 (loaded with Add-Type).
// PowerShell is far too slow for per-pixel work on full-size art, so the few
// operations that need it live here.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class BrandPixels
{
    static byte[] Read(Bitmap bmp, out BitmapData data)
    {
        data = bmp.LockBits(new Rectangle(0, 0, bmp.Width, bmp.Height), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        byte[] px = new byte[data.Stride * bmp.Height];
        Marshal.Copy(data.Scan0, px, 0, px.Length);
        return px;
    }

    static void Write(Bitmap bmp, BitmapData data, byte[] px)
    {
        Marshal.Copy(px, 0, data.Scan0, px.Length);
        bmp.UnlockBits(data);
    }

    static double Clamp01(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    // Average opaque colour in a (2*half+1) square around (x, y), as "r,g,b".
    public static int[] Sample(Bitmap bmp, int x, int y, int half)
    {
        BitmapData data;
        byte[] px = Read(bmp, out data);
        long r = 0, g = 0, b = 0, n = 0;
        for (int j = y - half; j <= y + half; j++)
            for (int i = x - half; i <= x + half; i++)
            {
                if (i < 0 || j < 0 || i >= bmp.Width || j >= bmp.Height) continue;
                int o = j * data.Stride + i * 4;
                if (px[o + 3] < 250) continue;
                b += px[o]; g += px[o + 1]; r += px[o + 2]; n++;
            }
        bmp.UnlockBits(data);
        if (n == 0) return new int[] { -1, -1, -1 };
        return new int[] { (int)(r / n), (int)(g / n), (int)(b / n) };
    }

    // Removes a flat backdrop of colour key that is connected to the seed
    // points, with a soft, colour-decontaminated edge: pixels closer than
    // `near` to the key vanish, pixels further than `far` are kept, and those
    // in between become partly transparent. Only pixels reachable from a seed
    // through backdrop-like pixels are touched, so similar colours inside the
    // character survive.
    public static int KeyOut(Bitmap bmp, int keyR, int keyG, int keyB, int[] seeds, double near, double far)
    {
        BitmapData data;
        byte[] px = Read(bmp, out data);
        int w = bmp.Width, h = bmp.Height, stride = data.Stride;
        bool[] seen = new bool[w * h];
        Queue<int> queue = new Queue<int>();
        for (int s = 0; s + 1 < seeds.Length; s += 2)
        {
            int idx = seeds[s + 1] * w + seeds[s];
            if (!seen[idx]) { seen[idx] = true; queue.Enqueue(idx); }
        }
        int changed = 0;
        int[] dx = { 1, -1, 0, 0 }, dy = { 0, 0, 1, -1 };
        while (queue.Count > 0)
        {
            int idx = queue.Dequeue();
            int x = idx % w, y = idx / w, o = y * stride + x * 4;
            int a0 = px[o + 3];
            if (a0 == 0) continue;
            double b = px[o], g = px[o + 1], r = px[o + 2];
            double d = Math.Sqrt((r - keyR) * (r - keyR) + (g - keyG) * (g - keyG) + (b - keyB) * (b - keyB));
            if (d >= far) continue; // character: stop here
            double keep = Clamp01((d - near) / (far - near));
            if (keep <= 0)
            {
                px[o + 3] = 0;
            }
            else
            {
                // Remove the backdrop's share of the colour: p = keep*c + (1-keep)*k.
                px[o + 2] = (byte)Math.Round(Clamp01((r - (1 - keep) * keyR) / keep / 255) * 255);
                px[o + 1] = (byte)Math.Round(Clamp01((g - (1 - keep) * keyG) / keep / 255) * 255);
                px[o] = (byte)Math.Round(Clamp01((b - (1 - keep) * keyB) / keep / 255) * 255);
                px[o + 3] = (byte)Math.Round(a0 * keep);
            }
            changed++;
            // Only spread through pixels that are clearly backdrop.
            if (keep > 0.5) continue;
            for (int k = 0; k < 4; k++)
            {
                int nx = x + dx[k], ny = y + dy[k];
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                int n = ny * w + nx;
                if (seen[n]) continue;
                seen[n] = true;
                queue.Enqueue(n);
            }
        }
        Write(bmp, data, px);
        return changed;
    }

    // Grid points (every `step` px) whose colour is within `near` of the key:
    // seeds for KeyOut that also reach backdrop pockets the character encloses.
    public static int[] GridSeeds(Bitmap bmp, int keyR, int keyG, int keyB, double near, int step)
    {
        BitmapData data;
        byte[] px = Read(bmp, out data);
        List<int> seeds = new List<int>();
        for (int y = 0; y < bmp.Height; y += step)
            for (int x = 0; x < bmp.Width; x += step)
            {
                int o = y * data.Stride + x * 4;
                if (px[o + 3] < 250) continue;
                double b = px[o], g = px[o + 1], r = px[o + 2];
                double d = Math.Sqrt((r - keyR) * (r - keyR) + (g - keyG) * (g - keyG) + (b - keyB) * (b - keyB));
                if (d < near) { seeds.Add(x); seeds.Add(y); }
            }
        bmp.UnlockBits(data);
        return seeds.ToArray();
    }

    // Blends every pixel towards its grey value: 0 keeps colour, 1 is greyscale.
    public static void Desaturate(Bitmap bmp, double amount)
    {
        BitmapData data;
        byte[] px = Read(bmp, out data);
        for (int o = 0; o < px.Length; o += 4)
        {
            double b = px[o], g = px[o + 1], r = px[o + 2];
            double l = 0.299 * r + 0.587 * g + 0.114 * b;
            px[o + 2] = (byte)Math.Round(r + (l - r) * amount);
            px[o + 1] = (byte)Math.Round(g + (l - g) * amount);
            px[o] = (byte)Math.Round(b + (l - b) * amount);
        }
        Write(bmp, data, px);
    }

    // 3x3 unsharp mask on colour (alpha untouched). For tiny icons, where
    // downscaling softens the face.
    public static void Sharpen(Bitmap bmp, double amount)
    {
        BitmapData data;
        byte[] px = Read(bmp, out data);
        byte[] src = (byte[])px.Clone();
        int w = bmp.Width, h = bmp.Height, stride = data.Stride;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                int o = y * stride + x * 4;
                if (src[o + 3] == 0) continue;
                for (int c = 0; c < 3; c++)
                {
                    double sum = 0; int n = 0;
                    for (int j = -1; j <= 1; j++)
                        for (int i = -1; i <= 1; i++)
                        {
                            int xx = x + i, yy = y + j;
                            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                            int q = yy * stride + xx * 4;
                            if (src[q + 3] == 0) continue;
                            sum += src[q + c]; n++;
                        }
                    double blur = sum / n;
                    double v = src[o + c] + amount * (src[o + c] - blur);
                    px[o + c] = (byte)(v < 0 ? 0 : v > 255 ? 255 : Math.Round(v));
                }
            }
        Write(bmp, data, px);
    }
}
