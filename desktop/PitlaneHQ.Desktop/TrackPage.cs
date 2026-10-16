using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace PitlaneHQ.Desktop;

/// <summary>
/// Community's track page, native: the track's layout as a road with depth, its start/finish line, the direction
/// arrow and the official turns; how many drivers and laps it has; and the record of every car on it (a row opens
/// that car's leaderboard). The same as the web's and the phones' (/community/track).
/// </summary>
public partial class MainWindow
{
    private JsonNode? _trk;
    private int _trkId;

    private async void OnComTrackPage(object sender, RoutedEventArgs e)
    {
        if (ComTrack.SelectedItem is not ComboItem t) return;
        await OpenTrackPageAsync(t.Id, t.Name);
    }

    private void OnComTrackClose(object sender, RoutedEventArgs e) => ComTrkCard.Visibility = Visibility.Collapsed;

    private async Task OpenTrackPageAsync(int trackId, string name)
    {
        _trkId = trackId;
        ComTrkCard.Visibility = Visibility.Visible;
        ComTrkT.Text = name.ToUpperInvariant();
        ComTrkSub.Text = T("Loading…", "Cargando…");
        ComTrkRecT.Text = T("RECORD PER CAR", "RÉCORD POR COCHE");
        ComTrkClose.Content = T("Close", "Cerrar");
        ComTrkRows.Children.Clear();
        ComTrkMap.Children.Clear();
        try { _trk = await _engine.GetAsync($"/api/community/track?trackId={trackId}&game=iracing"); }
        catch (Exception ex) { ComTrkSub.Text = ex.Message; return; }
        if (_trkId != trackId || _trk == null) return;
        var tn = S(_trk["track"]);
        if (tn != "") ComTrkT.Text = tn.ToUpperInvariant();
        var cars = _trk["cars"]?.AsArray() ?? new JsonArray();
        ComTrkSub.Text = T($"{(int)D(_trk["drivers"])} drivers · {(int)D(_trk["laps"])} laps shared · {cars.Count} cars", $"{(int)D(_trk["drivers"])} pilotos · {(int)D(_trk["laps"])} vueltas compartidas · {cars.Count} coches");
        DrawTrackPage();
        int k = 0;
        foreach (var c in cars)
        {
            if (c == null) continue;
            var row = new Grid { Height = 30 };
            foreach (var w in new[] { 0.0, 96, 170, 70, 110 })
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = w == 0 ? new GridLength(1, GridUnitType.Star) : new GridLength(w) });
            var border = new Border { Child = row, CornerRadius = new CornerRadius(5), Padding = new Thickness(6, 0, 6, 0), Cursor = System.Windows.Input.Cursors.Hand };
            if (Bo(c["mine"])) border.Background = B("AccentSoft");
            else if (k % 2 == 1) border.Background = new SolidColorBrush(Color.FromArgb(10, 255, 255, 255));
            k++;
            void Cell(int col, string text, Brush fg, bool mono, HorizontalAlignment al = HorizontalAlignment.Left)
            {
                var tb = new TextBlock { Text = text, Foreground = fg, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = al, TextTrimming = TextTrimming.CharacterEllipsis, FontSize = 13, Margin = new Thickness(0, 0, 8, 0) };
                if (mono) tb.FontFamily = (FontFamily)FindResource("FData");
                Grid.SetColumn(tb, col);
                row.Children.Add(tb);
            }
            var alias = S(c["alias"]) == "Anonymous" ? T("Anonymous", "Anónimo") : S(c["alias"]);
            Cell(0, S(c["car"]), B("Fg"), false);
            Cell(1, LapTime(D(c["time"])), B("Pb"), true, HorizontalAlignment.Right);
            Cell(2, alias + (Bo(c["sup"]) ? "  ★" : "") + (Bo(c["mine"]) ? T("  (you)", "  (tú)") : ""), Bo(c["field"]) ? B("Muted") : B("Fg"), false);
            Cell(3, T($"{(int)D(c["n"])} drv.", $"{(int)D(c["n"])} pil."), B("Muted"), true, HorizontalAlignment.Right);
            var created = D(c["created"]);
            Cell(4, created > 0 ? DateTimeOffset.FromUnixTimeMilliseconds((long)created).LocalDateTime.ToString("d") : "", B("Muted"), true, HorizontalAlignment.Right);
            int cid = (int)D(c["carId"]);
            var cat = S(c["cat"]);
            border.MouseLeftButtonUp += async (_, _) => { if (cat != "") _disc = cat; _comTrack = trackId; _comCar = cid; _comKey = ""; await CommunityAsync(); };
            ComTrkRows.Children.Add(border);
        }
        if (cars.Count == 0)
            ComTrkRows.Children.Add(new TextBlock { Text = T("No shared laps on this track yet.", "Aún no hay vueltas compartidas en este circuito."), Foreground = B("Muted"), FontSize = 13 });
    }

    // the road with depth, the start/finish line and the arrow beside it, and the official turns, like every map
    private void DrawTrackPage()
    {
        var cv = ComTrkMap;
        cv.Children.Clear();
        var lay = _trk?["layout"];
        var xa = lay?["x"]?.AsArray();
        var ya = lay?["y"]?.AsArray();
        if (xa == null || ya == null || xa.Count < 20 || xa.Count != ya.Count)
        {
            ComTrkNote.Text = T("This track is not scanned yet: a lap driven here with Pitlane HQ Agent draws its map by itself.", "Este circuito aún no está escaneado: una vuelta en él con Pitlane HQ Agent dibuja el mapa sola.");
            ComTrkNote.Visibility = Visibility.Visible;
            ComTrkMapBox.Visibility = Visibility.Collapsed;
            return;
        }
        ComTrkMapBox.Visibility = Visibility.Visible;
        ComTrkNote.Visibility = Visibility.Collapsed;
        double[] xs = xa.Select(v => D(v)).ToArray(), ys = ya.Select(v => D(v)).ToArray();
        const double W = 600, H = 360; // the web's box, scaled whole by the Viewbox around the canvas
        int N = xs.Length;
        double minx = xs.Min(), maxx = xs.Max(), miny = ys.Min(), maxy = ys.Max();
        double pad = 26, k = Math.Min((W - 2 * pad) / Math.Max(maxx - minx, 1), (H - 2 * pad) / Math.Max(maxy - miny, 1));
        double ox = (W - 2 * pad - (maxx - minx) * k) / 2, oy = (H - 2 * pad - (maxy - miny) * k) / 2, cx = W / 2, cy = H / 2;
        Point P(int i) { i = ((i % N) + N) % N; return new Point(pad + (xs[i] - minx) * k + ox, H - pad - (ys[i] - miny) * k - oy); }
        int step = Math.Max(1, N / 900);
        var asphalt = new SolidColorBrush(Color.FromRgb(0x15, 0x1a, 0x21));
        foreach (var (col, w, op, dx, dy) in new[] { ((Brush)Brushes.Black, 24.0, 0.38, 2.0, 3.5), (B("Line"), 22.0, 1.0, 0.0, 0.0), ((Brush)asphalt, 17.0, 1.0, 0.0, 0.0) })
        {
            var pl = new Polyline { Stroke = col, StrokeThickness = w, Opacity = op, StrokeLineJoin = PenLineJoin.Round, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round };
            for (int i = 0; i < N; i += step) pl.Points.Add(P(i));
            pl.Points.Add(P(0));
            if (dx != 0 || dy != 0) pl.RenderTransform = new TranslateTransform(dx, dy);
            cv.Children.Add(pl);
        }
        // the start/finish line across the road and the way the cars go beside it, on the outside of the track
        Point p0 = P(0), p1 = P(Math.Max(2, N / 60));
        double ux = p1.X - p0.X, uy = p1.Y - p0.Y, um = Math.Max(1e-6, Math.Sqrt(ux * ux + uy * uy));
        ux /= um; uy /= um;
        double nx = -uy, ny = ux;
        if ((p0.X - cx) * nx + (p0.Y - cy) * ny < 0) { nx = -nx; ny = -ny; }
        const double half = 10;
        cv.Children.Add(new Line { X1 = p0.X - nx * half, Y1 = p0.Y - ny * half, X2 = p0.X + nx * half, Y2 = p0.Y + ny * half, Stroke = Brushes.White, StrokeThickness = 3 });
        double bx = p0.X + nx * (half + 8), by = p0.Y + ny * (half + 8), tx = bx + ux * 18, ty = by + uy * 18, h = 6;
        cv.Children.Add(new Line { X1 = bx, Y1 = by, X2 = tx - ux * h, Y2 = ty - uy * h, Stroke = B("Fg"), StrokeThickness = 2, StrokeStartLineCap = PenLineCap.Round });
        cv.Children.Add(new Polygon { Fill = B("Fg"), Points = new PointCollection { new Point(tx, ty), new Point(tx - ux * h + nx * h * .6, ty - uy * h + ny * h * .6), new Point(tx - ux * h - nx * h * .6, ty - uy * h - ny * h * .6) } });
        // the official turns, beside the road
        var turns = _trk?["turns"]?.AsArray();
        if (turns == null) return;
        int n = 0;
        foreach (var t in turns)
        {
            n++;
            double f = D(t);
            if (f < 0 || f >= 1) continue;
            int i = (int)Math.Round(f * N) % N;
            Point q = P(i), q1 = P(i + 2), q0 = P(i - 2);
            double tmx = q1.X - q0.X, tmy = q1.Y - q0.Y, tm = Math.Max(1e-3, Math.Sqrt(tmx * tmx + tmy * tmy));
            double qx = -tmy / tm, qy = tmx / tm;
            if ((q.X - cx) * qx + (q.Y - cy) * qy < 0) { qx = -qx; qy = -qy; }
            var tb = new TextBlock { Text = "T" + n, Foreground = B("Muted"), FontFamily = (FontFamily)FindResource("FData"), FontSize = 10, FontWeight = FontWeights.Bold };
            tb.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
            Canvas.SetLeft(tb, q.X + qx * 15 - tb.DesiredSize.Width / 2);
            Canvas.SetTop(tb, q.Y + qy * 15 - tb.DesiredSize.Height / 2);
            cv.Children.Add(tb);
        }
    }
}
