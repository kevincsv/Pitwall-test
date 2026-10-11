using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace PitlaneHQ.Desktop;

/// <summary>
/// Analysis, native: a session of your account, laps A and B (your laps, and the model's references: the next
/// level for lap A's pace and the record), the gap, the charts along the lap, the corners where A loses the most
/// (the engine's coach, the same code as the coach overlay) and every lap of the session.
/// </summary>
public partial class MainWindow
{
    // X/Y: the path the car drove every 5 m (the lap's trace), for the coach's racing line and the map; IncAt: its
    // incidents as [m from the line, points, …]
    private sealed record AnaLap(string Label, double Time, double[][] Bins, bool Valid, int N, int Inc, double[]? Sectors, string Kind, double[]? X = null, double[]? Y = null, double[]? IncAt = null)
    {
        public override string ToString() => Label;
    }
    private sealed record SessItem(string Id, string Label, int TrackId, int CarId) { public override string ToString() => Label; }

    private List<AnaLap> _anaLaps = new();
    private JsonNode? _model;
    private bool _anaFilling, _imperial;
    private string _anaSessId = "";
    private int _anaTrackId;
    // the track map, like the web's and the phones': its toggles (braking points, incidents, the coach's corners, the two
    // lines, where A gains or loses), the engine's answer for the laps shown (tips, braking points, the line) and the
    // track's layout drawn by the community, for laps with no path of their own
    private bool _mapBrk = true, _mapInc = true, _mapCoach = true, _mapLine = true, _mapDelta = true;
    private JsonNode? _coachRes;
    private double[]? _layoutX, _layoutY;

    private static string Esc(string s) => Uri.EscapeDataString(s).Replace("%3A", ":").Replace("%3a", ":");
    private Task<JsonNode?> AccountGet(string path) => _engine.GetAsync("/api/sync/get?p=" + Uri.EscapeDataString(path));

    private double Spd(double ms) => _imperial ? ms * 2.23694 : ms * 3.6;
    private string SpdU => _imperial ? "mph" : "km/h";

    private void ApplyAnaLanguage()
    {
        AnaTitle.Text = T("Analysis", "Análisis"); AnaSessL.Text = T("SESSION", "SESIÓN");
        AnaSpeedT.Text = T("SPEED", "VELOCIDAD"); AnaPedT.Text = T("THROTTLE AND BRAKE", "ACELERADOR Y FRENO"); AnaDeltaT.Text = T("TIME DELTA (A − B)", "DIFERENCIA DE TIEMPO (A − B)");
        AnaCoachT.Text = T("WHERE A LOSES TIME", "DÓNDE PIERDE TIEMPO A"); AnaLapsT.Text = T("LAPS", "VUELTAS"); AnaMapT.Text = T("TRACK MAP", "MAPA DEL CIRCUITO");
        AnaMore.Content = T("Sectors and more in the full analyzer", "Sectores y más en el analizador completo");
        FillMapBar();
    }

    // the map's legend and toggles, the web's chips: each one redraws the map
    private void FillMapBar()
    {
        AnaMapBar.Children.Clear();
        void Leg(Brush col, string text)
        {
            AnaMapBar.Children.Add(new Border { Width = 9, Height = 9, CornerRadius = new CornerRadius(5), Background = col, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 5, 0) });
            AnaMapBar.Children.Add(new TextBlock { Text = text, Style = (Style)FindResource("Note"), Margin = new Thickness(0, 0, 12, 0), VerticalAlignment = VerticalAlignment.Center });
        }
        Leg(B("Accent"), T("A brakes", "A frena"));
        Leg(B("Blue"), T("B brakes", "B frena"));
        void Tog(string text, Func<bool> get, Action flip)
        {
            var chip = Chip(text, get() ? B("Fg") : B("Muted"));
            chip.Background = get() ? B("AccentSoft") : B("Surface2");
            chip.Cursor = Cursors.Hand;
            chip.Margin = new Thickness(0, 0, 6, 4);
            chip.MouseLeftButtonUp += (_, _) => { flip(); FillMapBar(); _ = DrawAnalysisAsync(false); };
            AnaMapBar.Children.Add(chip);
        }
        Tog(T("Braking", "Frenadas"), () => _mapBrk, () => _mapBrk = !_mapBrk);
        Tog(T("Incidents", "Incidentes"), () => _mapInc, () => _mapInc = !_mapInc);
        Tog(T("Coach", "Coach"), () => _mapCoach, () => _mapCoach = !_mapCoach);
        Tog(T("Line A / B", "Trazada A / B"), () => _mapLine, () => _mapLine = !_mapLine);
        Tog(T("A vs B time", "Tiempo A vs B"), () => _mapDelta, () => _mapDelta = !_mapDelta);
    }

    private async Task AnalysisAsync()
    {
        ApplyAnaLanguage();
        try { _imperial = S((await _engine.GetAsync("/api/desk"))?["units"]) == "imperial"; } catch { }
        JsonArray? list;
        try { list = (await AccountGet("/api/sessions?limit=100&game=iracing"))?.AsArray(); }
        catch (Exception ex)
        {
            AnaMsg.Text = T("Sign in to your account (Account) to see your laps here. ", "Entra en tu cuenta (Cuenta) para ver tus vueltas aquí. ") + ex.Message;
            AnaMsg.Visibility = Visibility.Visible;
            AnaBody.Visibility = Visibility.Collapsed;
            return;
        }
        var items = (list ?? new JsonArray()).Where(x => x != null).Select(x =>
        {
            var when = DateTimeOffset.FromUnixTimeMilliseconds((long)D(x!["started"])).LocalDateTime;
            var track = S(x["track"]) + (S(x["track_config"]) != "" ? " · " + S(x["track_config"]) : "");
            return new SessItem(S(x["id"]), $"{when:g} · {S(x["kind"])} · {track} · {S(x["car"])}", (int)D(x["track_id"]), (int)D(x["car_id"]));
        }).ToList();
        _anaFilling = true;
        AnaSess.ItemsSource = items;
        var cur = items.FirstOrDefault(i => i.Id == _anaSessId) ?? items.FirstOrDefault();
        AnaSess.SelectedItem = cur;
        _anaFilling = false;
        if (cur == null)
        {
            AnaMsg.Text = T("No sessions in your account yet: drive with Pitlane HQ open and they appear here.", "Aún no hay sesiones en tu cuenta: corre con Pitlane HQ abierto y aparecen aquí.");
            AnaMsg.Visibility = Visibility.Visible;
            return;
        }
        if (cur.Id != _anaSessId) await LoadSessionAsync(cur);
    }

    private async void OnAnaSess(object sender, SelectionChangedEventArgs e)
    {
        if (_anaFilling || AnaSess.SelectedItem is not SessItem s) return;
        await LoadSessionAsync(s);
    }

    private void OnAnaMore(object sender, RoutedEventArgs e) => OpenInApp("laps");

    private async Task LoadSessionAsync(SessItem s)
    {
        _anaSessId = s.Id;
        _anaTrackId = s.TrackId;
        _coachKey = "";
        _coachRes = null;
        _layoutX = _layoutY = null;
        AnaMsg.Text = T("Loading…", "Cargando…");
        AnaMsg.Visibility = Visibility.Visible;
        JsonNode? j;
        try { j = await AccountGet("/api/sessions/" + Esc(s.Id) + "?traces=1"); }
        catch (Exception ex) { AnaMsg.Text = ex.Message; return; }
        _anaLaps = new List<AnaLap>();
        foreach (var l in j?["laps"]?.AsArray() ?? new JsonArray())
        {
            var d = l?["trace"]?["d"]?.AsArray();
            if (l == null || d == null || d.Count < 10 || !(D(l["time"]) > 0)) continue;
            // the app's points [speed, throttle, brake, gear, steering, time] → [speed, time, throttle, brake, gear, steering]
            var bins = d.Select(x => x is JsonArray a && a.Count >= 6 ? new[] { D(a[0]), D(a[5]), D(a[1]), D(a[2]), D(a[3]), D(a[4]) } : Array.Empty<double>()).ToArray();
            double[]? sec = l["sectors"] is JsonArray sa ? sa.Select(D).ToArray() : null;
            var valid = Bo(l["valid"]);
            int n = (int)D(l["n"]);
            double[]? px = l["trace"]?["x"] is JsonArray xa ? xa.Select(D).ToArray() : null, py = l["trace"]?["y"] is JsonArray ya ? ya.Select(D).ToArray() : null;
            double[]? incAt = l["incAt"] is JsonArray ia ? ia.Select(D).ToArray() : null;
            _anaLaps.Add(new AnaLap($"{T("L", "V")}{n} · {LapTime(D(l["time"]))}{(valid ? "" : " ✕")}", D(l["time"]), bins, valid, n, (int)D(l["inc"]), sec, "own", px, py, incAt));
        }
        // laps with no path of their own (older ones) still get their map: the track's layout drawn by the community
        if (s.TrackId > 0 && !_anaLaps.Any(l => l.X != null && l.X.Length > 10))
            try
            {
                var m = await _engine.GetAsync($"/api/trackmap?trackId={s.TrackId}&game=iracing");
                double[]? lx = m?["x"] is JsonArray mx ? mx.Select(D).ToArray() : null, ly = m?["y"] is JsonArray my ? my.Select(D).ToArray() : null;
                if (lx != null && ly != null && lx.Length > 10 && lx.Length == ly.Length) { _layoutX = lx; _layoutY = ly; }
            }
            catch { }
        if (_anaLaps.Count == 0)
        {
            AnaMsg.Text = T("These laps have no telemetry: turn on sending the whole lap on the PC.", "Estas vueltas no tienen telemetría: activa en el PC enviar la vuelta completa.");
            AnaBody.Visibility = Visibility.Collapsed;
            return;
        }
        AnaMsg.Visibility = Visibility.Collapsed;
        // the model of this car and track: its record and the next level for lap A's pace
        _model = null;
        if (s.TrackId > 0 && s.CarId > 0)
            try { _model = await _engine.GetAsync($"/api/community/model?trackId={s.TrackId}&carId={s.CarId}&game=iracing"); } catch { }
        FillLaps();
    }

    // the record and the next level from the model, as laps B can be (real laps, never composites)
    private IEnumerable<AnaLap> ModelRefs(AnaLap a)
    {
        if (_model == null) yield break;
        var ideal = _model["ideal"]?.AsArray();
        var it = D(_model["idealTime"]);
        if (ideal != null && ideal.Count > 10 && it > 0 && Math.Abs(it - a.Time) >= 0.002)
            yield return new AnaLap("★ " + T("Record", "Récord") + " · " + LapTime(it), it, ideal.Select(r => r is JsonArray q ? q.Select(D).ToArray() : Array.Empty<double>()).ToArray(), true, 0, 0, null, "record",
                (_model["idealXY"] ?? _model["lineXY"])?["x"]?.AsArray().Select(D).ToArray(), (_model["idealXY"] ?? _model["lineXY"])?["y"]?.AsArray().Select(D).ToArray());
        var ladder = _model["ladder"]?.AsArray();
        if (ladder == null || ladder.Count == 0) yield break;
        int nb = (int)D(_model["nb"]);
        int i = -1;
        for (int k = 0; k < ladder.Count; k++) if (a.Time <= D(ladder[k]?["upTo"])) { i = k; break; }
        if (i < 0) i = ladder.Count - 1;
        while (i > 0 && !(D(ladder[i]?["time"]) < a.Time * 0.997)) i--;
        var lv = ladder[i];
        double t = D(lv?["time"]);
        if (!(t < a.Time - 0.001)) yield break;
        // the model keeps one point in two: back to every 5 m
        var raw = lv?["bins"]?.AsArray().Select(r => r is JsonArray q ? q.Select(D).ToArray() : Array.Empty<double>()).ToArray() ?? Array.Empty<double[]>();
        var up = new List<double[]>();
        for (int k = 0; k < raw.Length; k++)
        {
            var b = raw[k];
            if (b.Length < 5) continue;
            up.Add(b);
            var nx = k + 1 < raw.Length && raw[k + 1].Length >= 2 ? raw[k + 1] : b;
            up.Add(new[] { (b[0] + nx[0]) / 2, (b[1] + nx[1]) / 2, b[2], b[3], b[4] });
        }
        if (nb > 0 && up.Count > nb) up = up.Take(nb).ToList();
        // its line, kept one point in two too
        double[]? Up(JsonArray? v)
        {
            if (v == null || v.Count < 6) return null;
            var o = new List<double>();
            for (int k = 0; k < v.Count; k++) { double c = D(v[k]), nx = D(v[Math.Min(v.Count - 1, k + 1)]); o.Add(c); o.Add((c + nx) / 2); }
            return (nb > 0 && o.Count > nb ? o.Take(nb) : o).ToArray();
        }
        yield return new AnaLap("▲ " + T("Next level", "Siguiente nivel") + " · " + LapTime(t), t, up.ToArray(), true, 0, 0, null, "level", Up(lv?["x"]?.AsArray()) ?? _model?["lineXY"]?["x"]?.AsArray().Select(D).ToArray(), Up(lv?["y"]?.AsArray()) ?? _model?["lineXY"]?["y"]?.AsArray().Select(D).ToArray());
    }

    private void FillLaps()
    {
        _anaFilling = true;
        var own = _anaLaps.OrderBy(l => l.N).ToList();
        AnaA.ItemsSource = own;
        var best = own.Where(l => l.Valid).OrderBy(l => l.Time).FirstOrDefault() ?? own.OrderBy(l => l.Time).First();
        AnaA.SelectedItem = best;
        FillB(best);
        _anaFilling = false;
        _ = DrawAnalysisAsync();
    }

    // lap B: the model's references first (each once), then the other laps of the session
    private void FillB(AnaLap a)
    {
        var refs = ModelRefs(a).ToList();
        var others = _anaLaps.Where(l => l != a).OrderBy(l => l.Time).ToList();
        var list = refs.Concat(others).ToList();
        AnaB.ItemsSource = list;
        AnaB.SelectedItem = refs.FirstOrDefault(r => r.Kind == "level") ?? others.FirstOrDefault() ?? refs.FirstOrDefault();
    }

    private async void OnAnaLap(object sender, SelectionChangedEventArgs e)
    {
        if (_anaFilling) return;
        if (sender == AnaA && AnaA.SelectedItem is AnaLap a) { _anaFilling = true; FillB(a); _anaFilling = false; }
        await DrawAnalysisAsync();
    }

    private void OnAnaResize(object sender, SizeChangedEventArgs e) { if (e.WidthChanged) _ = DrawAnalysisAsync(false); }

    private string _coachKey = "";

    private async Task DrawAnalysisAsync(bool coach = true)
    {
        if (AnaA.SelectedItem is not AnaLap a) return;
        var b = AnaB.SelectedItem as AnaLap;
        AnaBody.Visibility = Visibility.Visible;
        AnaLegA.Text = "A · " + a.Label;
        AnaLegB.Text = b == null ? "B" : "B · " + b.Label;
        // the gap and its key facts
        AnaFacts.Children.Clear();
        void Fact(string label, string value, Brush col)
        {
            var sp = new StackPanel { Margin = new Thickness(0, 0, 28, 4) };
            sp.Children.Add(new TextBlock { Text = label.ToUpperInvariant(), Style = (Style)FindResource("Label"), Margin = new Thickness(0) });
            sp.Children.Add(new TextBlock { Text = value, Foreground = col, FontFamily = (FontFamily)FindResource("FData"), FontSize = 22 });
            AnaFacts.Children.Add(sp);
        }
        Fact(T("Lap A", "Vuelta A"), LapTime(a.Time), B("Accent"));
        if (b != null)
        {
            Fact(T("Lap B", "Vuelta B"), LapTime(b.Time), B("Blue"));
            var g = a.Time - b.Time;
            Fact(T("Gap", "Diferencia"), (g >= 0 ? "+" : "−") + Math.Abs(g).ToString("0.000"), g <= 0 ? B("Good") : B("Bad"));
        }
        Fact(T("Top speed A", "Vel. máx. A"), Math.Round(Spd(a.Bins.Where(x => x.Length > 0).Select(x => x[0]).DefaultIfEmpty(0).Max())) + " " + SpdU, B("Fg"));
        // the charts
        double len = Math.Max(a.Bins.Length, b?.Bins.Length ?? 0) * 5;
        Chart(AnaSpeed, new[] { (a, 0, B("Accent"), 2.0, 1.0), (b, 0, B("Blue"), 1.6, 0.9) }, len, x => Spd(x));
        Chart(AnaPedals, new[] { (b, 2, B("Good"), 1.2, 0.35), (b, 3, B("Bad"), 1.2, 0.35), (a, 2, B("Good"), 1.8, 1.0), (a, 3, B("Bad"), 1.8, 1.0) }, len, x => x, 0, 1);
        DeltaChart(a, b, len);
        // every lap of the session
        AnaLaps.Children.Clear();
        int k = 0;
        double bestT = _anaLaps.Where(l => l.Valid).Select(l => l.Time).DefaultIfEmpty(0).Min();
        foreach (var l in _anaLaps.OrderBy(l => l.N))
        {
            var row = new Grid { Height = 26 };
            foreach (var w in new[] { 60.0, 110, 80, 0 }) row.ColumnDefinitions.Add(new ColumnDefinition { Width = w == 0 ? new GridLength(1, GridUnitType.Star) : new GridLength(w) });
            var border = new Border { Child = row, CornerRadius = new CornerRadius(5), Padding = new Thickness(6, 0, 6, 0), Opacity = l.Valid ? 1 : 0.5 };
            if (l == a) border.Background = B("AccentSoft");
            else if (k % 2 == 1) border.Background = new SolidColorBrush(Color.FromArgb(10, 255, 255, 255));
            k++;
            void C(int col, string text, Brush fg)
            {
                var tb = new TextBlock { Text = text, Foreground = fg, FontFamily = (FontFamily)FindResource("FData"), FontSize = 12.5, VerticalAlignment = VerticalAlignment.Center };
                Grid.SetColumn(tb, col);
                row.Children.Add(tb);
            }
            C(0, T("L", "V") + l.N, B("Muted"));
            C(1, LapTime(l.Time), l.Valid && Math.Abs(l.Time - bestT) < 0.0005 ? B("Pb") : B("Fg"));
            C(2, l.Inc > 0 ? l.Inc + "x" : "", B("Bad"));
            C(3, l.Sectors == null ? "" : string.Join("   ", l.Sectors.Select(x => x > 0 ? x.ToString("0.000") : "–")), B("Muted"));
            var lap = l;
            border.MouseLeftButtonUp += async (_, _) => { AnaA.SelectedItem = lap; await Task.CompletedTask; };
            AnaLaps.Children.Add(border);
        }
        // the coach: where A loses the most against B (the engine works it out), and the map with its answer
        var key = b == null ? "" : a.Label + "|" + b.Label + "|" + _lang;
        bool fresh = coach && b != null && key != _coachKey;
        if (b == null || fresh) _coachRes = null;
        DrawMap(a, b);
        if (!coach || b == null || !fresh) return;
        _coachKey = key;
        AnaTips.Children.Clear();
        var (res, err) = await _engine.SendAsync("/api/desk/coach", new { a = a.Bins, b = b.Bins, ax = a.X, ay = a.Y, bx = b.X, by = b.Y, trackId = _anaTrackId });
        if (err != null) { AnaTips.Children.Add(new TextBlock { Text = err, Style = (Style)FindResource("Note") }); return; }
        if (key != _coachKey) return; // other laps were chosen meanwhile
        _coachRes = res;
        DrawMap(a, b);
        var tips = res?["tips"]?.AsArray();
        if (tips == null || tips.Count == 0)
        {
            AnaTips.Children.Add(new TextBlock { Text = T("Lap A loses nothing clear against lap B.", "La vuelta A no pierde nada claro frente a la B."), Style = (Style)FindResource("Note") });
            return;
        }
        foreach (var t in tips)
        {
            var g = new Grid { Margin = new Thickness(0, 3, 0, 3) };
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(48) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(70) });
            var cn = Chip(S(t?["name"]) is { Length: > 0 } nm ? nm : "T" + (int)D(t?["n"]), B("Fg"));
            cn.Margin = new Thickness(0);
            cn.HorizontalAlignment = HorizontalAlignment.Left;
            g.Children.Add(cn);
            var tip = new TextBlock { Text = S(t?["tip"]), Foreground = B("Fg"), FontSize = 13.5, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center };
            Grid.SetColumn(tip, 1);
            g.Children.Add(tip);
            var lost = new TextBlock { Text = "+" + D(t?["lost"]).ToString("0.00"), Foreground = B("Bad"), FontFamily = (FontFamily)FindResource("FData"), FontSize = 13, HorizontalAlignment = HorizontalAlignment.Right, VerticalAlignment = VerticalAlignment.Center };
            Grid.SetColumn(lost, 2);
            g.Children.Add(lost);
            AnaTips.Children.Add(g);
        }
    }

    // the track map, the same as the web's and the phones': the track as a road with depth, where A gains (green) or
    // loses (red) time against B, the direction arrow and the sectors, the braking points of both laps, the incidents,
    // the coach's corners (named by the official turns) and, with both paths, B dashed along the middle and A beside it
    // by how far it was from B (2.2 px a metre at 600 px wide)
    private void DrawMap(AnaLap a, AnaLap? b)
    {
        var cv = AnaMap;
        cv.Children.Clear();
        double W = cv.ActualWidth, H = cv.Height;
        if (W < 40) return;
        // the road: B's own path when both laps have one (B runs along the middle, A beside it), else the lap's own,
        // else the track's layout drawn by the community
        double[]? xs = null, ys = null;
        bool roadIsB = false;
        if (a.X != null && a.Y != null && a.X.Length > 10 && b?.X != null && b.Y != null && b.X.Length > 10) { xs = b.X; ys = b.Y; roadIsB = true; }
        else if (a.X != null && a.Y != null && a.X.Length > 10) { xs = a.X; ys = a.Y; }
        else if (b?.X != null && b.Y != null && b.X.Length > 10) { xs = b.X; ys = b.Y; }
        else if (_layoutX != null && _layoutY != null) { xs = _layoutX; ys = _layoutY; }
        if (xs == null || ys == null || xs.Length != ys.Length || xs.Length < 10)
        {
            AnaMapNote.Text = T("This track is not scanned yet: a lap recorded with Pitlane HQ at this track draws its map by itself.", "Este circuito aún no está escaneado: una vuelta grabada con Pitlane HQ en él dibuja el mapa sola.");
            AnaMapNote.Visibility = Visibility.Visible;
            return;
        }
        AnaMapNote.Visibility = Visibility.Collapsed;
        int N = xs.Length;
        int nb = b == null ? a.Bins.Length : Math.Min(a.Bins.Length, b.Bins.Length);
        double L = Math.Max(nb, 2) * 5.0;
        double minx = xs.Min(), maxx = xs.Max(), miny = ys.Min(), maxy = ys.Max();
        double pad = 26, k = Math.Min((W - 2 * pad) / Math.Max(maxx - minx, 1), (H - 2 * pad) / Math.Max(maxy - miny, 1)), s = W / 600.0;
        double ox = (W - 2 * pad - (maxx - minx) * k) / 2, oy = (H - 2 * pad - (maxy - miny) * k) / 2, cx = W / 2, cy = H / 2;
        Point P(int i) { i = ((i % N) + N) % N; return new Point(pad + (xs[i] - minx) * k + ox, H - pad - (ys[i] - miny) * k - oy); }
        Point At(double d) => P((int)Math.Round(d / L * N));
        Point Out(Point q, double r) { double dx = q.X - cx, dy = q.Y - cy, m = Math.Max(1e-6, Math.Sqrt(dx * dx + dy * dy)); return new Point(q.X + dx / m * r, q.Y + dy / m * r); }
        Polyline Poly(Brush col, double w, double op = 1)
        {
            var pl = new Polyline { Stroke = col, StrokeThickness = w, Opacity = op, StrokeLineJoin = PenLineJoin.Round, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round };
            cv.Children.Add(pl);
            return pl;
        }
        void Label(string text, double x, double y, Brush col, double size)
        {
            var tb = new TextBlock { Text = text, Foreground = col, FontFamily = (FontFamily)FindResource("FData"), FontSize = size, FontWeight = FontWeights.Bold };
            tb.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
            Canvas.SetLeft(tb, x - tb.DesiredSize.Width / 2);
            Canvas.SetTop(tb, y - tb.DesiredSize.Height / 2);
            cv.Children.Add(tb);
        }
        void Dot(Point q, double r, Brush fill, Brush stroke, double sw, string? tip, double op = 1)
        {
            var e = new Ellipse { Width = 2 * r, Height = 2 * r, Fill = fill, Stroke = stroke, StrokeThickness = sw, Opacity = op, ToolTip = tip };
            Canvas.SetLeft(e, q.X - r);
            Canvas.SetTop(e, q.Y - r);
            cv.Children.Add(e);
        }
        // the road with depth: its shadow, the rim and the darker asphalt inside
        int step = Math.Max(1, N / 900);
        foreach (var (col, w, op, dx, dy) in new[] { ((Brush)Brushes.Black, 24 * s, 0.38, 2.0, 3.5), (B("Line"), 22 * s, 1.0, 0.0, 0.0), ((Brush)new SolidColorBrush(Color.FromRgb(0x15, 0x1a, 0x21)), 17 * s, 1.0, 0.0, 0.0) })
        {
            var pl = Poly(col, w, op);
            for (int i = 0; i < N; i += step) pl.Points.Add(P(i));
            pl.Points.Add(P(0));
            if (dx != 0 || dy != 0) pl.RenderTransform = new TranslateTransform(dx, dy);
        }
        // where A gains or loses time against B, in 48 stretches, stronger where more time changes hands
        if (_mapDelta && b != null && nb > 10)
        {
            const int SEG = 48;
            var segs = new List<(int i0, int i1, double v)>();
            for (int j = 0; j < SEG; j++)
            {
                int i0 = (int)Math.Floor((double)j / SEG * (nb - 1)), i1 = (int)Math.Floor((double)(j + 1) / SEG * (nb - 1));
                double[] a0 = a.Bins[i0], a1 = a.Bins[i1], b0 = b.Bins[i0], b1 = b.Bins[i1];
                if (a0.Length < 2 || a1.Length < 2 || b0.Length < 2 || b1.Length < 2) continue;
                segs.Add((i0, i1, (a1[1] - b1[1]) - (a0[1] - b0[1])));
            }
            double mx = Math.Max(0.01, segs.Select(g => Math.Abs(g.v)).DefaultIfEmpty(0).Max());
            foreach (var g in segs)
            {
                if (Math.Abs(g.v) < 0.003) continue;
                var pl = Poly(g.v > 0 ? B("Bad") : B("Good"), 7 * s, 0.3 + 0.7 * Math.Min(1, Math.Abs(g.v) / mx));
                int m0 = (int)Math.Round(g.i0 * 5.0 / L * N), m1 = (int)Math.Round(g.i1 * 5.0 / L * N);
                for (int m = m0; m <= m1; m++) pl.Points.Add(P(m));
            }
        }
        // the way the cars go: an arrow beside the start/finish line, on the outside of the track
        if (N > 20)
        {
            Point p0 = P(0), p1 = P(Math.Max(2, N / 60));
            double dx = p1.X - p0.X, dy = p1.Y - p0.Y, m = Math.Max(1e-6, Math.Sqrt(dx * dx + dy * dy)), ux = dx / m, uy = dy / m, nx = -uy, ny = ux;
            if ((p0.X - cx) * nx + (p0.Y - cy) * ny < 0) { nx = -nx; ny = -ny; }
            double bx = p0.X + nx * 13 * s, by = p0.Y + ny * 13 * s, tx = bx + ux * 18 * s, ty = by + uy * 18 * s, h = 6 * s;
            cv.Children.Add(new Line { X1 = bx, Y1 = by, X2 = tx - ux * h, Y2 = ty - uy * h, Stroke = B("Bad"), StrokeThickness = 2.2 * s, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round });
            var head = new Polygon { Fill = B("Bad") };
            head.Points.Add(new Point(tx, ty));
            head.Points.Add(new Point(tx - ux * h + nx * h * .6, ty - uy * h + ny * h * .6));
            head.Points.Add(new Point(tx - ux * h - nx * h * .6, ty - uy * h - ny * h * .6));
            cv.Children.Add(head);
        }
        // the two lines on the track: B dashed along the middle, A beside it by how far it was from B
        var lat = _coachRes?["lat"]?.AsArray();
        if (_mapLine && roadIsB && lat != null && lat.Count > 10)
        {
            double EX = 2.2 * s;
            Polyline? cur = null;
            for (int m = 0; m <= N; m++)
            {
                int i = (int)Math.Round((double)(m % N) / N * L / 5);
                var v = i < lat.Count ? lat[i] : null;
                if (v == null) { cur = null; continue; }
                int i0 = ((m - 2) % N + N) % N, i1 = (m + 2) % N;
                double tx = xs[i1] - xs[i0], ty = ys[i1] - ys[i0], tm = Math.Max(1e-6, Math.Sqrt(tx * tx + ty * ty)), o = Math.Max(-5, Math.Min(5, D(v))) * EX;
                var q = P(m);
                cur ??= Poly(B("Accent"), 2.6 * s);
                cur.Points.Add(new Point(q.X + (-ty / tm) * o, q.Y - (tx / tm) * o));
            }
            var pb = Poly(new SolidColorBrush(Color.FromRgb(0xcf, 0xe3, 0xff)), 1.6 * s, 0.85);
            pb.StrokeDashArray = new DoubleCollection { 5, 4 };
            for (int i = 0; i < N; i += step) pb.Points.Add(P(i));
            pb.Points.Add(P(0));
        }
        // the corners by their official turns, outside the track
        var brA = _coachRes?["brakes"]?.AsArray();
        var brB = _coachRes?["brakesB"]?.AsArray();
        if (brA != null)
            foreach (var z in brA)
            {
                var q = Out(At(D(z?["d"])), 22 * s);
                Label(S(z?["name"]) is { Length: > 0 } nm ? nm : "T" + (int)D(z?["n"]), q.X, q.Y + 2, B("Muted"), 10.5);
            }
        // the sectors: the start/finish line, a cut at each sector change, S1, S2… on the inside
        int cnt = Math.Max(3, Math.Max(a.Sectors?.Length ?? 0, b?.Sectors?.Length ?? 0));
        (double nx, double ny) Normal(double d)
        {
            Point q = At(d), q2 = At((d + 12) % L);
            double tx = q2.X - q.X, ty = q2.Y - q.Y, tm = Math.Max(1e-6, Math.Sqrt(tx * tx + ty * ty));
            return (-ty / tm, tx / tm);
        }
        void Bar(double d, double len, Brush col, double w)
        {
            var q = At(d);
            var (nx, ny) = Normal(d);
            cv.Children.Add(new Line { X1 = q.X - nx * len, Y1 = q.Y - ny * len, X2 = q.X + nx * len, Y2 = q.Y + ny * len, Stroke = col, StrokeThickness = w });
        }
        Bar(0, 10 * s, B("Fg"), 3 * s);
        for (int j = 1; j < cnt; j++) Bar(j / (double)cnt * L, 8 * s, B("Muted"), 1.5 * s);
        for (int j = 0; j < cnt; j++)
        {
            double d = (j + .5) / cnt * L;
            var q = At(d);
            var (nx, ny) = Normal(d);
            double inw = nx * (q.X - cx) + ny * (q.Y - cy) > 0 ? -1 : 1;
            Label("S" + (j + 1), q.X + nx * inw * 22 * s, q.Y + ny * inw * 22 * s, B("Accent"), 10.5);
        }
        // the coach's corners: a ring where A loses the most, with its tip
        var tips = _coachRes?["tips"]?.AsArray();
        if (_mapCoach && tips != null)
            foreach (var t in tips)
                Dot(At(D(t?["d"])), 13 * s, Brushes.Transparent, B("Pb"), 2.5 * s, $"{S(t?["name"])} · +{D(t?["lost"]):0.00} s: {S(t?["tip"])}", 0.9);
        // the braking points: B's then A's on top
        if (_mapBrk)
        {
            if (brB != null) foreach (var z in brB) Dot(At(D(z?["d"])), 4.5 * s, B("Blue"), B("Bg"), 1.5 * s, $"B · {Math.Round(D(z?["d"]))} m · {Math.Round(D(z?["v"]))}→{Math.Round(D(z?["vmin"]))} {SpdU}");
            if (brA != null) foreach (var z in brA) Dot(At(D(z?["d"])), 5.5 * s, B("Accent"), B("Bg"), 1.5 * s, $"A · {Math.Round(D(z?["d"]))} m · {Math.Round(D(z?["v"]))}→{Math.Round(D(z?["vmin"]))} {SpdU}");
        }
        // lap A's incidents, as crosses with their points
        if (_mapInc && a.IncAt != null)
            for (int i = 0; i + 1 < a.IncAt.Length; i += 2)
            {
                var q = At(a.IncAt[i]);
                double r = 5 * s;
                int pts = (int)a.IncAt[i + 1];
                string tip = $"{pts}x · {Math.Round(a.IncAt[i])} m";
                cv.Children.Add(new Line { X1 = q.X - r, Y1 = q.Y - r, X2 = q.X + r, Y2 = q.Y + r, Stroke = B("Bad"), StrokeThickness = 2.2 * s, ToolTip = tip });
                cv.Children.Add(new Line { X1 = q.X + r, Y1 = q.Y - r, X2 = q.X - r, Y2 = q.Y + r, Stroke = B("Bad"), StrokeThickness = 2.2 * s, ToolTip = tip });
                Label(pts + "x", q.X + 12 * s, q.Y - 9 * s, B("Bad"), 9.5);
            }
    }

    // a chart along the lap: one line per (lap, channel); y fits the values unless lo/hi are given
    private void Chart(Canvas cv, (AnaLap? lap, int ch, Brush col, double w, double a)[] lines, double len, Func<double, double> f, double? lo = null, double? hi = null)
    {
        cv.Children.Clear();
        double W = cv.ActualWidth, H = cv.Height;
        if (W < 20 || len <= 0) return;
        double mn = lo ?? double.MaxValue, mx = hi ?? double.MinValue;
        if (lo == null || hi == null)
            foreach (var (lap, ch, _, _, _) in lines)
                if (lap != null)
                    foreach (var p in lap.Bins)
                        if (p.Length > ch) { var v = f(p[ch]); mn = Math.Min(mn, v); mx = Math.Max(mx, v); }
        if (mn >= mx) { mn = 0; mx = 1; }
        var m = (mx - mn) * 0.06;
        if (lo == null) mn -= m;
        if (hi == null) mx += m;
        foreach (var y in new[] { 0.25, 0.5, 0.75 })
            cv.Children.Add(new Line { X1 = 0, X2 = W, Y1 = H * y, Y2 = H * y, Stroke = B("Line"), StrokeThickness = 1 });
        foreach (var (lap, ch, col, w, a) in lines)
        {
            if (lap == null) continue;
            var pl = new Polyline { Stroke = col, StrokeThickness = w, Opacity = a, StrokeLineJoin = PenLineJoin.Round };
            int step = Math.Max(1, lap.Bins.Length / 1500);
            for (int i = 0; i < lap.Bins.Length; i += step)
            {
                var p = lap.Bins[i];
                if (p.Length <= ch) continue;
                pl.Points.Add(new Point(i * 5 / len * W, H - (f(p[ch]) - mn) / (mx - mn) * H));
            }
            cv.Children.Add(pl);
        }
        var lab = new TextBlock { Text = Math.Round(mx).ToString() + (cv == AnaSpeed ? " " + SpdU : ""), Foreground = B("Muted"), FontFamily = (FontFamily)FindResource("FData"), FontSize = 10 };
        if (cv == AnaSpeed) { Canvas.SetLeft(lab, 4); Canvas.SetTop(lab, 2); cv.Children.Add(lab); }
    }

    // the time A loses (above the line) or gains (below) against B along the lap
    private void DeltaChart(AnaLap a, AnaLap? b, double len)
    {
        var cv = AnaDelta;
        cv.Children.Clear();
        double W = cv.ActualWidth, H = cv.Height;
        if (b == null || W < 20 || len <= 0) return;
        int n = Math.Min(a.Bins.Length, b.Bins.Length);
        var d = new List<(int i, double v)>();
        for (int i = 0; i < n; i++)
            if (a.Bins[i].Length > 1 && b.Bins[i].Length > 1) d.Add((i, a.Bins[i][1] - b.Bins[i][1]));
        if (d.Count < 2) return;
        double m = Math.Max(0.2, d.Max(x => Math.Abs(x.v))) * 1.1;
        cv.Children.Add(new Line { X1 = 0, X2 = W, Y1 = H / 2, Y2 = H / 2, Stroke = B("Muted"), StrokeThickness = 1, Opacity = 0.6 });
        var pl = new Polyline { Stroke = B("Accent"), StrokeThickness = 2, StrokeLineJoin = PenLineJoin.Round };
        int step = Math.Max(1, d.Count / 1500);
        for (int k = 0; k < d.Count; k += step) pl.Points.Add(new Point(d[k].i * 5 / len * W, H / 2 - d[k].v / m * (H / 2 - 4)));
        cv.Children.Add(pl);
        var lab = new TextBlock { Text = "±" + m.ToString("0.0") + " s", Foreground = B("Muted"), FontFamily = (FontFamily)FindResource("FData"), FontSize = 10 };
        Canvas.SetLeft(lab, 4); Canvas.SetTop(lab, 2);
        cv.Children.Add(lab);
    }
}
