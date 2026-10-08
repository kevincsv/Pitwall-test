using System.Diagnostics;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;

namespace PitlaneHQ.Desktop;

/// <summary>
/// The native window over the Go engine. Home, Telemetry and Overlays are native screens (WPF); the screens not
/// moved yet (Analysis, Community, Account, Settings) are the app inside a WebView until each one is moved over.
/// Everything is in the app's language (the engine says which) and its colours and fonts.
/// </summary>
public partial class MainWindow : Window
{
    private readonly Engine _engine = new();
    private readonly DispatcherTimer _poll = new() { Interval = TimeSpan.FromSeconds(2) };
    private readonly DispatcherTimer _fast = new() { Interval = TimeSpan.FromMilliseconds(100) };
    private readonly CancellationTokenSource _cts = new();
    private bool _webReady, _webStarted, _busyFast, _busyPoll;
    private string _view = "home";
    private string _lang = "";
    private bool Es => _lang == "es" || _lang == "both";
    private string T(string en, string es) => Es ? es : en;
    private readonly Border[] _rpm = new Border[16];

    // the native screens; every other view is the WebView
    private static readonly HashSet<string> Native = new() { "home", "live", "overlays", "me", "settings", "community", "laps" };

    public MainWindow()
    {
        InitializeComponent();
        for (int i = 0; i < 16; i++)
        {
            _rpm[i] = new Border { CornerRadius = new CornerRadius(2), Margin = new Thickness(i == 0 ? 0 : 2, 0, 0, 0), BorderThickness = new Thickness(1) };
            RpmLights.Children.Add(_rpm[i]);
        }
        _poll.Tick += async (_, _) => await RefreshAsync();
        _fast.Tick += async (_, _) => await FastAsync();
        ApplyLanguage(System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "es" ? "es" : "en");
    }

    private Brush B(string key) => (Brush)FindResource(key);
    private static Brush Hex(string? h)
    {
        try { return (Brush)new BrushConverter().ConvertFromString(string.IsNullOrEmpty(h) ? "#E7EBF1" : h)!; }
        catch { return Brushes.White; }
    }
    private static string S(JsonNode? n, string def = "") => n?.ToString() ?? def;
    private static double D(JsonNode? n) { try { return n?.GetValue<double>() ?? 0; } catch { return double.TryParse(n?.ToString(), out var v) ? v : 0; } }
    private static bool Bo(JsonNode? n) { try { return n?.GetValue<bool>() ?? false; } catch { return false; } }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        Starting.Visibility = Visibility.Visible;
        var exe = Engine.FindExe(Environment.GetCommandLineArgs().Skip(1).ToArray());
        if (exe == null)
        {
            StartError.Text = T("PitlaneHQ.exe was not found. Put PitlaneHQ.Desktop.exe in the same folder as PitlaneHQ.exe.", "No se encontró PitlaneHQ.exe. Pon PitlaneHQ.Desktop.exe en la misma carpeta que PitlaneHQ.exe.");
            EngineText.Text = "Engine: not found";
            return;
        }
        try
        {
            await _engine.StartAsync(exe, _cts.Token);
            EngineText.Text = "Engine: " + _engine.Base;
            Starting.Visibility = Visibility.Collapsed;
            // the app runs behind the native screens from the start (hidden): the race engineer, the beeps and
            // the recording of your laps live there
            _ = EnsureWebAsync();
            _poll.Start();
            _fast.Start();
            await RefreshAsync();
            ShowView(_view);
        }
        catch (Exception ex)
        {
            StartError.Text = ex.Message;
            EngineText.Text = "Engine: failed";
        }
    }

    // the WebView starts the first time a screen that is not native yet is opened
    private async Task EnsureWebAsync()
    {
        if (_webStarted) return;
        _webStarted = true;
        try
        {
            // its own data folder (the install folder may not be writable) and no slowing down while hidden:
            // the beeps and the engineer keep their timing behind a native screen
            var env = await CoreWebView2Environment.CreateAsync(null,
                System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PitlaneHQ", "WebView2-desktop"),
                new CoreWebView2EnvironmentOptions("--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows"));
            await Web.EnsureCoreWebView2Async(env);
            Web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            Web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            Web.CoreWebView2.NewWindowRequested += OnNewWindow;
            Web.CoreWebView2.NavigationCompleted += (_, _) => { _webReady = true; ShowView(_view); };
            Web.Source = new Uri(_engine.Url + "#" + _view);
        }
        catch (Exception ex) { StartError.Text = ex.Message; }
    }

    // links to other sites open in the normal browser, never inside the app
    private void OnNewWindow(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (e.Uri.StartsWith("https://") || e.Uri.StartsWith("http://"))
            Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true });
    }

    private void ApplyLanguage(string lang)
    {
        if (lang == _lang) return;
        _lang = lang;
        NavHome.Content = T("Home", "Inicio"); NavAnalysis.Content = T("Analysis", "Análisis"); NavCommunity.Content = T("Community", "Comunidad");
        NavLive.Content = T("Telemetry", "Telemetría"); NavOverlays.Content = "Overlays"; NavAccount.Content = T("Account", "Cuenta"); NavSettings.Content = T("Settings", "Ajustes");
        HomeTitle.Text = T("Home", "Inicio"); GameLabel.Text = T("GAME", "JUEGO"); TrackLabel.Text = T("TRACK", "CIRCUITO"); CarLabel.Text = T("CAR", "COCHE");
        RacesTitle.Text = T("RECENT RACES", "CARRERAS RECIENTES"); RacesEmpty.Text = T("Your races appear here after you finish one.", "Tus carreras aparecen aquí cuando terminas una.");
        LiveTitle.Text = T("Telemetry", "Telemetría"); GearLabel.Text = T("GEAR", "MARCHA"); SpeedLabel.Text = T("SPEED", "VELOCIDAD");
        CurLabel.Text = T("CURRENT LAP", "VUELTA ACTUAL"); DeltaLabel.Text = T("DELTA TO BEST", "DELTA VS MEJOR"); BestLabel.Text = T("BEST LAP", "MEJOR VUELTA"); LastLabel.Text = T("LAST LAP", "ÚLTIMA VUELTA");
        FuelTitle.Text = T("FUEL", "COMBUSTIBLE"); FuelTankL.Text = T("in tank", "en el depósito"); FuelLapsL.Text = T("laps of fuel", "vueltas posibles"); FuelPerL.Text = T("per lap", "por vuelta");
        RelTitle.Text = "RELATIVE"; RelEmpty.Text = T("Waiting for cars on track", "Esperando coches en pista");
        OvTitle.Text = "Overlays"; OvSub.Text = T("Windows on top of the game, drawn by Pitlane HQ. Open them here; Auto opens them when you get in the car.", "Ventanas sobre el juego, dibujadas por Pitlane HQ. Ábrelas aquí; Auto las abre al subirte al coche.");
        OvWipText.Text = T("In development: the overlays are for admins for now.", "En desarrollo: los overlays son solo para admins por ahora.");
        OvReset.Content = T("Reset positions", "Restablecer posiciones"); OvCloseAll.Content = T("Close all", "Cerrar todos"); OvAlphaL.Text = T("OPACITY", "OPACIDAD");
        OvPresetsL.Text = T("PRESETS", "PERFILES"); OvPresetSave.Content = T("+ Save current", "+ Guardar el actual"); DemoText.Text = T("DEMO DATA", "DATOS DE PRUEBA");
        StartingText.Text = T("Starting the Pitlane HQ engine…", "Arrancando el motor de Pitlane HQ…");
        AccTitle.Text = T("Account", "Cuenta"); AccSignInT.Text = T("SIGN IN", "INICIAR SESIÓN"); AccEmailL.Text = "EMAIL"; AccPassL.Text = T("PASSWORD", "CONTRASEÑA");
        AccCodeL.Text = T("CODE FROM YOUR AUTHENTICATOR APP (OR A RECOVERY CODE)", "CÓDIGO DE TU APP DE AUTENTICACIÓN (O UN CÓDIGO DE RECUPERACIÓN)");
        AccLogin.Content = T("Sign in", "Entrar"); AccCreate.Content = T("Create an account", "Crear una cuenta");
        AccNameL.Text = T("PUBLIC NAME", "NOMBRE PÚBLICO"); AccNameSave.Content = T("Save", "Guardar");
        AccNameNote.Text = T("Changing it here changes it everywhere, your shared laps too.", "Si lo cambias aquí cambia en todas partes, también en tus vueltas compartidas.");
        AccEmailT.Text = "EMAIL"; AccReveal.Content = _reveal ? T("Hide", "Ocultar") : T("Show", "Mostrar"); AccSyncT.Text = T("SYNC", "SINCRONIZACIÓN");
        AccSync.Content = T("Sync now", "Sincronizar ahora"); AccOut.Content = T("Sign out on this PC", "Cerrar sesión en este PC");
        AccMore.Content = T("More (password, two-step sign-in, devices, admin)", "Más (contraseña, verificación en dos pasos, dispositivos, admin)");
        SetTitle.Text = T("Settings", "Ajustes"); SetGenT.Text = "GENERAL"; SetStart.Content = T("Start with Windows", "Iniciar con Windows");
        SetCloseOv.Content = T("Close the overlays when Pitlane HQ closes", "Cerrar los overlays al cerrar Pitlane HQ");
        SetBeepT.Text = T("BRAKING BEEPS", "PITIDOS DE FRENADA"); SetBeepOff.Content = T("Off", "Apagados"); SetBeepOne.Content = T("1 beep", "1 pitido"); SetBeepCount.Content = T("3 beeps", "3 pitidos");
        SetTraffic.Content = T("Earlier with traffic", "Antes con tráfico"); SetVolL.Text = T("VOLUME", "VOLUMEN");
        SetBeepNote.Text = T("Where to brake comes from the model of your car and track; the beeps come earlier with more speed, or with a car close ahead or alongside.", "El punto de frenada sale del modelo de tu coche y circuito; los pitidos suenan antes con más velocidad o con un coche justo delante o al lado.");
        SetUpdT.Text = T("UPDATES", "ACTUALIZACIONES"); SetUpdAuto.Content = T("Install updates by themselves when no sim is running", "Instalar las actualizaciones solas cuando no hay ningún simulador abierto");
        SetUpdCheck.Content = T("Check now", "Comprobar ahora"); SetUpdApply.Content = T("Update now", "Actualizar ahora");
        SetMoreT.Text = T("MORE", "MÁS"); SetMoreNote.Text = T("Language and units, the race engineer's voice, the phone, notifications and About.", "Idioma y unidades, la voz del ingeniero, el móvil, las notificaciones y Acerca de.");
        SetMore.Content = T("Open all the settings", "Abrir todos los ajustes");
        ComTitle.Text = T("Community", "Comunidad"); ComBoardT.Text = "LEADERBOARD";
        ComSub.Text = T("Leaderboards by lap time: the fastest lap of each car and track in every account, shared by itself.", "Leaderboards por tiempo de vuelta: la vuelta más rápida de cada coche y circuito de cada cuenta, compartida sola.");
        ComMore.Content = T("Profiles, race summaries and leagues", "Perfiles, resúmenes de carrera y ligas");
        _comKey = "";
        ApplyAnaLanguage();
        _ovKey = "";
    }

    // ---------- the slow refresh: status, Home ----------

    private async Task RefreshAsync()
    {
        if (_busyPoll) return;
        _busyPoll = true;
        try
        {
            if (!_engine.Running)
            {
                EngineText.Text = "Engine: stopped";
                ConnDot.Fill = B("Bad");
                return;
            }
            var st = Status.From(await _engine.GetAsync("/api/info"), await _engine.GetAsync("/api/now"));
            ConnDot.Fill = B(st.Connected ? "Good" : "Bad");
            ConnText.Text = st.Connected ? st.Game + T(" connected", " conectado") : T("Waiting for ", "Esperando a ") + st.Game;
            TrackText.Text = st.Track == "" ? "–" : st.Track;
            CarText.Text = st.Car == "" ? "–" : st.Car;
            VersionText.Text = st.Version == "" ? "desktop" : $"v{st.Version} {st.Stage}";
            AccountText.Text = st.Account == "" ? T("iRacing: not signed in", "iRacing: sin sesión") : "iRacing: " + st.Account;
            DemoPill.Visibility = st.Demo ? Visibility.Visible : Visibility.Collapsed;
            if (_view == "home") { await HomeRacesAsync(); await HomeRatingsAsync(); }
            if (_view == "overlays") await OverlaysAsync();
            if (_view == "me") await AccountAsync();
        }
        catch (Exception ex) { EngineText.Text = "Engine: " + ex.Message; }
        finally { _busyPoll = false; }
    }

    private string _racesKey = "";
    private async Task HomeRacesAsync()
    {
        var r = await _engine.GetAsync("/api/races");
        var list = r?["races"]?.AsArray();
        var key = (list?.Count ?? 0) + ":" + S(list?.FirstOrDefault()?["id"]) + _lang;
        if (key == _racesKey) return;
        _racesKey = key;
        RacesList.Children.Clear();
        RacesEmpty.Visibility = list == null || list.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        if (list == null) return;
        foreach (var race in list.Take(8))
        {
            if (race == null) continue;
            var when = DateTimeOffset.FromUnixTimeMilliseconds((long)D(race["when"])).LocalDateTime;
            var start = (int)D(race["start"]); var fin = (int)D(race["finish"]); var irc = (int)D(race["irChange"]); var inc = (int)D(race["inc"]);
            var g = new Grid();
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            g.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var left = new StackPanel();
            left.Children.Add(new TextBlock { Text = S(race["track"]), Foreground = B("Fg"), FontSize = 15, FontWeight = FontWeights.SemiBold, TextTrimming = TextTrimming.CharacterEllipsis });
            left.Children.Add(new TextBlock { Text = S(race["car"]) + " · " + when.ToString("g"), Foreground = B("Muted"), FontSize = 12 });
            g.Children.Add(left);
            var right = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
            right.Children.Add(Chip(fin > 0 ? $"P{start} → P{fin}" : "–", B("Fg")));
            right.Children.Add(Chip(inc + "x", inc > 4 ? B("Bad") : B("Muted")));
            right.Children.Add(Chip((irc >= 0 ? "+" : "−") + Math.Abs(irc) + " iR", irc >= 0 ? B("Good") : B("Bad")));
            Grid.SetColumn(right, 1);
            g.Children.Add(right);
            RacesList.Children.Add(new Border { Style = (Style)FindResource("Card"), Margin = new Thickness(0, 0, 12, 8), Child = g });
        }
    }

    // your iRating in every discipline: the game only says the one of the session you are in, so the engine keeps the
    // last one seen of each (every time you join a session with Pitlane HQ open, and from your recorded races)
    private string _ratingsKey = "";
    private async Task HomeRatingsAsync()
    {
        var r = (await _engine.GetAsync("/api/ratings"))?["ratings"]?.AsObject();
        var key = (r?.ToJsonString() ?? "") + _lang;
        if (key == _ratingsKey) return;
        _ratingsKey = key;
        RatingsList.Children.Clear();
        // the same symbols, colours and names as Community's discipline cards; one card for each, dim with nothing yet
        foreach (var (id, en, es) in Disciplines)
        {
            var d = r?[id];
            var ir = (int)D(d?["ir"]);
            var col = new SolidColorBrush(DiscColor(id));
            var row = new StackPanel { Orientation = Orientation.Horizontal };
            row.Children.Add(DiscIcon(id, 30));
            var sp = new StackPanel { Margin = new Thickness(10, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center };
            sp.Children.Add(new TextBlock { Text = T(en, es), Foreground = B("Muted"), FontSize = 12, FontWeight = FontWeights.SemiBold });
            sp.Children.Add(new TextBlock { Text = ir > 0 ? ir.ToString() : "–", Foreground = ir > 0 ? col : B("Muted"), FontFamily = (FontFamily)FindResource("FData"), FontSize = 20, FontWeight = FontWeights.Bold });
            if (ir > 0 && S(d?["lic"]) != "") sp.Children.Add(new TextBlock { Text = S(d?["lic"]), Foreground = B("Muted"), FontFamily = (FontFamily)FindResource("FData"), FontSize = 11 });
            row.Children.Add(sp);
            var c = DiscColor(id);
            RatingsList.Children.Add(new Border
            {
                Background = B("Surface"), BorderBrush = new SolidColorBrush(Color.FromArgb(0x60, c.R, c.G, c.B)), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(10),
                Padding = new Thickness(12, 10, 14, 10), Margin = new Thickness(0, 0, 8, 8), MinWidth = 150, Opacity = ir > 0 ? 1 : 0.5, Child = row,
                ToolTip = ir > 0 ? DateTimeOffset.FromUnixTimeMilliseconds((long)D(d?["at"])).LocalDateTime.ToString("d") : null,
            });
        }
        var any = r != null && r.Count > 0;
        RatingsTitle.Text = T("LICENCE SUMMARY", "RESUMEN DE LICENCIAS");
        RatingsNote.Text = T("Updated when you join a session with iRacing and Pitlane HQ open.", "Se actualiza al entrar en una sesión con iRacing y Pitlane HQ abiertos.");
        RatingsList.Visibility = any ? Visibility.Visible : Visibility.Collapsed;
        RatingsTitle.Visibility = RatingsNote.Visibility = any ? Visibility.Visible : Visibility.Collapsed;
    }

    private Border Chip(string text, Brush fg) => new()
    {
        Background = B("Surface2"), BorderBrush = B("Line"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(999), Padding = new Thickness(10, 3, 10, 3), Margin = new Thickness(6, 0, 0, 0),
        Child = new TextBlock { Text = text, Foreground = fg, FontFamily = (FontFamily)FindResource("FData"), FontSize = 12, FontWeight = FontWeights.SemiBold }
    };

    // ---------- the fast refresh: Telemetry (10 times a second) and the live strip on Home ----------

    private async Task FastAsync()
    {
        if (_busyFast || !_engine.Running || (_view != "live" && _view != "home")) return;
        _busyFast = true;
        try
        {
            var d = await _engine.GetAsync("/api/desk");
            if (d == null) return;
            ApplyLanguage(S(d["lang"], "en"));
            FillItems(_view == "home" ? HomeItems : LiveItems, d["items"]?.AsArray());
            if (_view == "live") Live(d);
        }
        catch { }
        finally { _busyFast = false; }
    }

    private void FillItems(WrapPanel box, JsonArray? items)
    {
        box.Children.Clear();
        if (items == null) return;
        foreach (var it in items)
        {
            if (it == null) continue;
            var sp = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 18, 6) };
            sp.Children.Add(new TextBlock { Text = S(it["label"]).ToUpperInvariant(), Foreground = B("Muted"), FontFamily = (FontFamily)FindResource("FData"), FontSize = 10, FontWeight = FontWeights.SemiBold, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 6, 0) });
            sp.Children.Add(new TextBlock { Text = S(it["value"]), Foreground = Hex(S(it["color"])), FontFamily = (FontFamily)FindResource("FData"), FontSize = 14, FontWeight = FontWeights.SemiBold });
            box.Children.Add(sp);
        }
    }

    private void Live(JsonNode d)
    {
        LiveTrack.Text = S(d["track"]);
        GearText.Text = S(d["gear"], "–");
        SpeedText.Text = S(d["speed"], "0");
        SpeedUnit.Text = S(d["speedUnit"], "km/h");
        CluBar.Height = 70 * Math.Clamp(D(d["clutch"]), 0, 1);
        BrkBar.Height = 70 * Math.Clamp(D(d["brake"]), 0, 1);
        ThrBar.Height = 70 * Math.Clamp(D(d["throttle"]), 0, 1);
        double rpm = D(d["rpm"]), first = D(d["rpmFirst"]), shift = D(d["rpmShift"]), blink = D(d["rpmBlink"]);
        int on = shift > first ? (int)Math.Round(Math.Clamp((rpm - first) / (shift - first) * 16, 0, 16)) : 0;
        bool lit = !(rpm >= blink && DateTime.Now.Millisecond / 80 % 2 == 0);
        for (int i = 0; i < 16; i++)
        {
            bool l = i < on && lit;
            _rpm[i].Background = !l ? B("Surface2") : rpm >= shift ? B("Pb") : i >= 13 ? B("Bad") : i >= 10 ? B("Warn") : B("Good");
            _rpm[i].BorderBrush = l ? Brushes.Transparent : B("Line");
        }
        RpmText.Text = "RPM " + (int)rpm;
        ShiftText.Text = shift > 0 ? T("SHIFT ", "CAMBIO ") + (int)shift : "";
        CurText.Text = S(d["cur"], "–");
        DeltaText.Text = S(d["delta"], "–");
        DeltaText.Foreground = d["deltaGood"] == null ? B("Fg") : Bo(d["deltaGood"]) ? B("Good") : B("Bad");
        BestText.Text = S(d["best"], "–");
        LastText.Text = S(d["last"], "–");
        LapProgress.Value = Math.Clamp(D(d["lapPct"]), 0, 1);
        var f = d["fuel"];
        FuelTank.Text = S(f?["tank"], "–") + " " + S(f?["unit"]);
        FuelLaps.Text = S(f?["laps"], "–");
        FuelPer.Text = S(f?["per"], "–");
        // the relative
        RelRows.Children.Clear();
        var rows = d["relative"]?.AsArray();
        RelEmpty.Visibility = rows == null || rows.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        if (rows == null) return;
        int k = 0;
        foreach (var r in rows)
        {
            if (r == null) continue;
            var row = new Grid { Height = 28 };
            foreach (var w in new[] { 44.0, 36, 0, 70, 50, 56 })
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = w == 0 ? new GridLength(1, GridUnitType.Star) : new GridLength(w) });
            var border = new Border { Child = row, CornerRadius = new CornerRadius(5), Padding = new Thickness(6, 0, 6, 0) };
            if (Bo(r["Me"])) border.Background = B("AccentSoft");
            else if (k % 2 == 1) border.Background = new SolidColorBrush(Color.FromArgb(10, 255, 255, 255));
            k++;
            if (Bo(r["Blank"])) { RelRows.Children.Add(border); continue; }
            double a = Bo(r["Pit"]) && !Bo(r["Me"]) ? 0.55 : 1;
            void Cell(int col, string text, Brush fg, bool mono, HorizontalAlignment al = HorizontalAlignment.Left)
            {
                var tb = new TextBlock { Text = text, Foreground = fg, Opacity = a, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = al, TextTrimming = TextTrimming.CharacterEllipsis, FontSize = mono ? 12.5 : 13.5 };
                if (mono) tb.FontFamily = (FontFamily)FindResource("FData");
                Grid.SetColumn(tb, col);
                row.Children.Add(tb);
            }
            Cell(0, S(r["Pos"]), B("Fg"), true);
            Cell(1, S(r["Num"]), B("Muted"), true);
            var rowTag = S(r["Tag"]);
            var lapsUp = (int?)r["Laps"]?.GetValue<double>() ?? 0;
            if (rowTag != "" || lapsUp != 0)
            {
                // your note on this driver: its tag's icon before the name, the note on hover
                var nameBox = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center, Opacity = a };
                if (rowTag != "")
                {
                    var tagIc = TagIcon(rowTag, 15);
                    tagIc.Margin = new Thickness(0, 0, 6, 0);
                    nameBox.Children.Add(tagIc);
                    var tagNote = S(r["Note"]);
                    nameBox.ToolTip = TagLabel(rowTag) + (tagNote != "" ? " · " + tagNote : "");
                }
                nameBox.Children.Add(new TextBlock { Text = S(r["Name"]), Foreground = Hex(S(r["NameColor"])), FontSize = 13.5, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis });
                if (lapsUp != 0)
                {
                    // laps up (red: they lap you) or down (blue: you lap them), like the overlays' pill
                    var lc = lapsUp > 0 ? B("Bad") : B("Blue");
                    nameBox.Children.Add(new Border
                    {
                        BorderBrush = lc, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(8), Padding = new Thickness(6, 0, 6, 0), Margin = new Thickness(6, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center,
                        Child = new TextBlock { Text = (lapsUp > 0 ? "+" : "−") + Math.Abs(lapsUp) + "L", Foreground = lc, FontFamily = (FontFamily)FindResource("FData"), FontSize = 10.5, FontWeight = FontWeights.Bold }
                    });
                }
                if (Bo(r["Pit"])) nameBox.Children.Add(new TextBlock { Text = "  PIT", Foreground = B("Muted"), FontSize = 11, VerticalAlignment = VerticalAlignment.Center });
                Grid.SetColumn(nameBox, 2);
                row.Children.Add(nameBox);
            }
            else Cell(2, S(r["Name"]) + (Bo(r["Pit"]) ? "  PIT" : ""), Hex(S(r["NameColor"])), false);
            var lic = S(r["Lic"]);
            if (lic != "" && lic != "–")
            {
                var lc = (SolidColorBrush)Hex(S(r["LicColor"]));
                var badge = new Border
                {
                    Background = new SolidColorBrush(Color.FromRgb((byte)(lc.Color.R * .62 + 11 * .38), (byte)(lc.Color.G * .62 + 13 * .38), (byte)(lc.Color.B * .62 + 16 * .38))),
                    BorderBrush = lc, BorderThickness = new Thickness(1.5), CornerRadius = new CornerRadius(4), Padding = new Thickness(5, 1, 5, 1), VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Left, Opacity = a,
                    Child = new TextBlock { Text = lic, Foreground = Brushes.White, FontFamily = (FontFamily)FindResource("FData"), FontSize = 10.5, FontWeight = FontWeights.Bold }
                };
                Grid.SetColumn(badge, 3);
                row.Children.Add(badge);
            }
            Cell(4, S(r["IR"]), B("Fg"), true, HorizontalAlignment.Right);
            Cell(5, S(r["Gap"]), B("Fg"), true, HorizontalAlignment.Right);
            RelRows.Children.Add(border);
        }
    }

    // ---------- Overlays (native) ----------

    private static readonly (string Id, string En, string Es)[] Overlays =
    {
        ("relative","Relative","Relative"),("standings","Standings","Posiciones"),("radar","Radar","Radar"),("deltabar","Delta bar","Barra de delta"),
        ("flag","Flags","Banderas"),("dash","Gear, speed & RPM","Marcha, velocidad y RPM"),("timing","Lap timing","Tiempos de vuelta"),("map","Track map","Mapa del circuito"),
        ("compare","Lap comparison","Comparación de vueltas"),("boost","DRS & push-to-pass","DRS y push-to-pass"),("inputs","Inputs","Pedales"),("fuel","Fuel","Combustible"),
        ("engine","Engine & track","Motor y pista"),("tyres","Tyres","Neumáticos"),("telemetry","Telemetry","Telemetría"),("gg","G-force circle","Círculo de fuerzas g"),
        ("stats","Driving stats","Estadísticas de conducción"),("pit","Pit stop calculator","Calculadora de parada"),("sectors","Mini-sectors","Mini-sectores"),("gaps","Gap graph","Gráfica de gaps"),
        ("incidents","Incident log","Registro de incidentes"),("coach","Braking coach","Coach de frenada"),("brakes","Braking markers","Marcas de frenada"),("radio","Radio","Radio"),
    };
    private static readonly (string Id, string En, string Es, string[] W)[] BuiltIn =
    {
        ("race","Race","Carrera",new[]{"radar","deltabar","relative","standings"}),
        ("qualifying","Qualifying","Clasificación",new[]{"deltabar","compare","inputs","map"}),
        ("endurance","Endurance","Resistencia",new[]{"relative","fuel","tyres","deltabar","standings"}),
        ("engineer","Engineer","Ingeniero",new[]{"map","relative","radar","inputs","fuel","tyres","telemetry"}),
    };
    private JsonObject? _cfg;
    private string _ovKey = "";
    private bool _wip;

    private async Task OverlaysAsync()
    {
        var list = await _engine.GetAsync("/api/overlay/list");
        var conf = await _engine.GetAsync("/api/config");
        var desk = await _engine.GetAsync("/api/desk");
        _wip = Bo(desk?["overlays"]) || Bo(desk?["wip"]); // the overlays are open to everyone
        ApplyLanguage(S(desk?["lang"], "en"));
        _cfg = conf?["config"]?.AsObject();
        if (_cfg == null) return;
        var open = new HashSet<string>(list?["open"]?.AsArray().Select(x => S(x)) ?? Enumerable.Empty<string>());
        var auto = new HashSet<string>(_cfg["autoWidgets"]?.AsArray().Select(x => S(x)) ?? Enumerable.Empty<string>());
        bool edit = Bo(_cfg["edit"]);
        var mine = _cfg["ui"]?["ovpresets"]?["list"]?.AsObject();
        var key = string.Join(",", open) + "|" + string.Join(",", auto) + "|" + edit + "|" + _wip + "|" + _lang + "|" + mine?.ToJsonString() + "|" + S(_cfg["alpha"]);
        if (key == _ovKey) return;
        _ovKey = key;
        OvWip.Visibility = _wip ? Visibility.Collapsed : Visibility.Visible;
        OvLock.Content = edit ? T("Lock overlays", "Bloquear overlays") : T("Move overlays", "Mover overlays");
        OvLock.IsEnabled = OvReset.IsEnabled = OvCloseAll.IsEnabled = OvPresetSave.IsEnabled = _wip;
        if (!OvAlpha.IsMouseCaptureWithin) OvAlpha.Value = Math.Clamp(D(_cfg["alpha"]), 40, 255);
        // presets: the four built in and yours (with their ×)
        OvPresets.Children.Clear();
        foreach (var p in BuiltIn)
        {
            var b = new Button { Style = (Style)FindResource("Btn"), Content = T(p.En, p.Es), IsEnabled = _wip };
            var ws = p.W;
            b.Click += async (_, _) => await ApplyPresetAsync(ws);
            OvPresets.Children.Add(b);
        }
        if (mine != null)
            foreach (var kv in mine)
            {
                var name = kv.Key;
                var ws = kv.Value?.AsArray().Select(x => S(x)).ToArray() ?? Array.Empty<string>();
                var b = new Button { Style = (Style)FindResource("Btn"), Content = name, IsEnabled = _wip };
                b.Click += async (_, _) => await ApplyPresetAsync(ws);
                var del = new Button { Style = (Style)FindResource("Btn"), Content = "×", ToolTip = T("Delete", "Eliminar"), Margin = new Thickness(-4, 0, 10, 6), IsEnabled = _wip };
                del.Click += async (_, _) => await DeletePresetAsync(name);
                OvPresets.Children.Add(b);
                OvPresets.Children.Add(del);
            }
        // one card per overlay: open/close and Auto
        OvCards.Children.Clear();
        foreach (var o in Overlays)
        {
            var id = o.Id;
            bool isOpen = open.Contains(id), isAuto = auto.Contains(id);
            var sp = new StackPanel();
            sp.Children.Add(new TextBlock { Text = T(o.En, o.Es), Foreground = B("Fg"), FontSize = 15, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 2) });
            sp.Children.Add(new TextBlock { Text = isOpen ? T("Open", "Abierto") : T("Closed", "Cerrado"), Foreground = isOpen ? B("Good") : B("Muted"), FontFamily = (FontFamily)FindResource("FData"), FontSize = 11, Margin = new Thickness(0, 0, 0, 10) });
            var bar = new WrapPanel();
            var ob = new Button { Style = (Style)FindResource(isOpen ? "Btn" : "BtnPrimary"), Content = isOpen ? T("Close", "Cerrar") : T("Open", "Abrir"), IsEnabled = _wip };
            ob.Click += async (_, _) => { await Post((isOpen ? "/api/overlay/close?w=" : "/api/overlay/open?w=") + id); _ovKey = ""; await OverlaysAsync(); };
            bar.Children.Add(ob);
            var cb = new CheckBox { Content = "Auto", IsChecked = isAuto, Foreground = B("Fg"), VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(6, 0, 0, 6), IsEnabled = _wip };
            cb.Click += async (_, _) => await SetAutoAsync(id, cb.IsChecked == true);
            bar.Children.Add(cb);
            sp.Children.Add(bar);
            OvCards.Children.Add(new Border { Style = (Style)FindResource("Card"), Width = 250, Child = sp, BorderBrush = isOpen ? B("Accent") : B("Line") });
        }
    }

    private async Task Post(string path, object? body = null)
    {
        try { await _engine.PostAsync(path, body); }
        catch (Exception ex) { EngineText.Text = "Engine: " + ex.Message; }
    }

    // the settings go back whole, as the app sends them (the engine keeps the window positions)
    private async Task SaveConfigAsync()
    {
        if (_cfg == null) return;
        _cfg.Remove("positions");
        await Post("/api/config", _cfg);
        _ovKey = "";
        await OverlaysAsync();
    }

    private async Task SetAutoAsync(string id, bool on)
    {
        if (_cfg == null) return;
        var auto = _cfg["autoWidgets"]?.AsArray().Select(x => S(x)).Where(x => x != id).ToList() ?? new List<string>();
        if (on) auto.Add(id);
        _cfg["autoWidgets"] = new JsonArray(auto.Select(x => (JsonNode?)JsonValue.Create(x)).ToArray());
        await SaveConfigAsync();
    }

    private async Task ApplyPresetAsync(string[] ws)
    {
        if (_cfg == null) return;
        var ids = Overlays.Select(o => o.Id).ToHashSet();
        _cfg["autoWidgets"] = new JsonArray(ws.Where(ids.Contains).Select(x => (JsonNode?)JsonValue.Create(x)).ToArray());
        _cfg["autoStart"] = true;
        _cfg["closeOnExit"] = true;
        await SaveConfigAsync();
    }

    private JsonObject MyPresets()
    {
        var ui = _cfg!["ui"] as JsonObject;
        if (ui == null) { ui = new JsonObject(); _cfg["ui"] = ui; }
        var op = ui["ovpresets"] as JsonObject;
        if (op == null) { op = new JsonObject(); ui["ovpresets"] = op; }
        var list = op["list"] as JsonObject;
        if (list == null) { list = new JsonObject(); op["list"] = list; }
        return list;
    }

    private async Task DeletePresetAsync(string name)
    {
        if (_cfg == null) return;
        if (MessageBox.Show(this, T($"Delete the preset “{name}”?", $"¿Eliminar el perfil «{name}»?"), "Pitlane HQ", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
        MyPresets().Remove(name);
        await SaveConfigAsync();
    }

    private async void OnOvPresetSave(object sender, RoutedEventArgs e)
    {
        if (_cfg == null) return;
        var name = (OvPresetName.Text ?? "").Trim();
        if (name.Length > 32) name = name[..32];
        var ws = _cfg["autoWidgets"]?.AsArray().Select(x => S(x)).ToArray() ?? Array.Empty<string>();
        if (name == "") { OvPresetName.Focus(); return; }
        if (ws.Length == 0) { MessageBox.Show(this, T("Turn on Auto for the overlays you want first.", "Activa primero Auto en los overlays que quieras."), "Pitlane HQ"); return; }
        var list = MyPresets();
        if (list.ContainsKey(name) && MessageBox.Show(this, T($"Replace the preset “{name}”?", $"¿Reemplazar el perfil «{name}»?"), "Pitlane HQ", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
        list[name] = new JsonArray(ws.Select(x => (JsonNode?)JsonValue.Create(x)).ToArray());
        OvPresetName.Text = "";
        await SaveConfigAsync();
    }

    private async void OnOvLock(object sender, RoutedEventArgs e)
    {
        if (_cfg == null) return;
        _cfg["edit"] = !Bo(_cfg["edit"]);
        await SaveConfigAsync();
    }

    private async void OnOvAlpha(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        if (_cfg == null) return;
        _cfg["alpha"] = (int)Math.Round(OvAlpha.Value);
        await SaveConfigAsync();
    }

    private async void OnOvReset(object sender, RoutedEventArgs e) { await Post("/api/overlay/reset"); _ovKey = ""; await OverlaysAsync(); }
    private async void OnOvCloseAll(object sender, RoutedEventArgs e) { await Post("/api/overlay/close?w=*"); _ovKey = ""; await OverlaysAsync(); }

    // ---------- Community (native): the leaderboards ----------

    private static readonly (string Id, string En, string Es)[] Disciplines =
        { ("oval", "Oval", "Óvalo"), ("sports_car", "Sports Car", "Sports Car"), ("formula_car", "Formula Car", "Fórmula"), ("dirt_oval", "Dirt Oval", "Óvalo de tierra"), ("dirt_road", "Dirt Road", "Tierra") };
    private JsonArray? _combos;
    private string _disc = "sports_car", _comKey = "";
    private int _comTrack, _comCar;
    private bool _comFilling;

    private async Task CommunityAsync()
    {
        try { _combos = (await _engine.GetAsync("/api/community/combos?game=iracing"))?["combos"]?.AsArray(); }
        catch (Exception ex) { ComEmpty.Text = ex.Message; ComEmpty.Visibility = Visibility.Visible; return; }
        // the discipline with laps first, the one chosen kept
        if (_combos != null && !_combos.Any(c => S(c?["cat"]) == _disc))
            _disc = _combos.Select(c => S(c?["cat"])).FirstOrDefault(c => c != "") ?? _disc;
        ComDisc.Children.Clear();
        foreach (var d in Disciplines)
        {
            var id = d.Id;
            int n = _combos?.Count(c => S(c?["cat"]) == id) ?? 0;
            var b = new Button { Style = (Style)FindResource(id == _disc ? "BtnPrimary" : "Btn"), Content = T(d.En, d.Es) + (n > 0 ? $"  {n}" : "") };
            b.Click += async (_, _) => { _disc = id; _comTrack = 0; _comCar = 0; await CommunityAsync(); };
            ComDisc.Children.Add(b);
        }
        FillCombos();
        await BoardAsync();
    }

    private record ComboItem(int Id, string Name, int Laps) { public override string ToString() => Name; }

    private void FillCombos()
    {
        if (_combos == null) return;
        _comFilling = true;
        var q = (ComSearch.Text ?? "").Trim().ToLowerInvariant();
        var list = _combos.Where(c => S(c?["cat"]) == _disc && (q == "" || (S(c?["track"]) + " " + S(c?["car"])).ToLowerInvariant().Contains(q))).ToList();
        var tracks = list.GroupBy(c => (int)D(c?["trackId"])).Select(g => new ComboItem(g.Key, S(g.First()?["track"]), g.Sum(x => (int)D(x?["laps"])))).OrderBy(t => t.Name).ToList();
        ComTrack.ItemsSource = tracks;
        if (!tracks.Any(t => t.Id == _comTrack)) _comTrack = tracks.FirstOrDefault()?.Id ?? 0;
        ComTrack.SelectedItem = tracks.FirstOrDefault(t => t.Id == _comTrack);
        var cars = list.Where(c => (int)D(c?["trackId"]) == _comTrack).Select(c => new ComboItem((int)D(c?["carId"]), S(c?["car"]), (int)D(c?["laps"]))).OrderByDescending(c => c.Laps).ToList();
        ComCar.ItemsSource = cars;
        if (!cars.Any(c => c.Id == _comCar)) _comCar = cars.FirstOrDefault()?.Id ?? 0;
        ComCar.SelectedItem = cars.FirstOrDefault(c => c.Id == _comCar);
        _comFilling = false;
    }

    private async void OnComFilter(object sender, TextChangedEventArgs e) { if (_combos == null) return; FillCombos(); await BoardAsync(); }
    private async void OnComTrack(object sender, SelectionChangedEventArgs e)
    {
        if (_comFilling || ComTrack.SelectedItem is not ComboItem t) return;
        _comTrack = t.Id; _comCar = 0; FillCombos(); await BoardAsync();
    }
    private async void OnComCar(object sender, SelectionChangedEventArgs e)
    {
        if (_comFilling || ComCar.SelectedItem is not ComboItem c) return;
        _comCar = c.Id; await BoardAsync();
    }
    private void OnComMore(object sender, RoutedEventArgs e) => OpenInApp("community");

    private async Task BoardAsync()
    {
        var key = _comTrack + ":" + _comCar + ":" + _lang;
        if (key == _comKey) return;
        _comKey = key;
        ComRows.Children.Clear();
        if (_comTrack == 0 || _comCar == 0)
        {
            ComEmpty.Text = T("No laps in this discipline yet: the first one saved in an account starts its leaderboards.", "Aún no hay vueltas en esta disciplina: la primera que se guarde en una cuenta abre sus leaderboards.");
            ComEmpty.Visibility = Visibility.Visible;
            return;
        }
        JsonArray? laps;
        try { laps = (await _engine.GetAsync($"/api/community/laps?trackId={_comTrack}&carId={_comCar}&game=iracing"))?["laps"]?.AsArray(); }
        catch (Exception ex) { ComEmpty.Text = ex.Message; ComEmpty.Visibility = Visibility.Visible; return; }
        ComEmpty.Visibility = laps == null || laps.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        ComEmpty.Text = T("Nobody has a lap here yet.", "Nadie tiene vuelta aquí todavía.");
        if (laps == null) return;
        double first = laps.Count > 0 ? D(laps[0]?["time"]) : 0;
        int k = 0;
        foreach (var l in laps.Take(100))
        {
            if (l == null) continue;
            var row = new Grid { Height = 30 };
            foreach (var w in new[] { 44.0, 0, 46, 96, 84, 110 })
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = w == 0 ? new GridLength(1, GridUnitType.Star) : new GridLength(w) });
            var border = new Border { Child = row, CornerRadius = new CornerRadius(5), Padding = new Thickness(6, 0, 6, 0) };
            if (Bo(l["mine"])) border.Background = B("AccentSoft");
            else if (k % 2 == 1) border.Background = new SolidColorBrush(Color.FromArgb(10, 255, 255, 255));
            k++;
            void Cell(int col, string text, Brush fg, bool mono, HorizontalAlignment al = HorizontalAlignment.Left)
            {
                var tb = new TextBlock { Text = text, Foreground = fg, VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = al, TextTrimming = TextTrimming.CharacterEllipsis, FontSize = mono ? 12.5 : 13.5 };
                if (mono) tb.FontFamily = (FontFamily)FindResource("FData");
                Grid.SetColumn(tb, col);
                row.Children.Add(tb);
            }
            double t = D(l["time"]);
            Cell(0, "P" + k, B("Muted"), true);
            Cell(1, S(l["alias"]) + (Bo(l["sup"]) ? "  ★" : "") + (Bo(l["mine"]) ? T("  (you)", "  (tú)") : ""), Bo(l["field"]) ? B("Muted") : B("Fg"), false);
            var lic = S(l["lic"]);
            if (lic != "")
            {
                var lc = lic switch { "R" => "#FF6363", "D" => "#FF8F45", "C" => "#F2C94C", "B" => "#38C97C", "A" => "#5C9DFF", _ => "#C9D1DC" };
                var lb = (SolidColorBrush)Hex(lc);
                var badge = new Border { BorderBrush = lb, BorderThickness = new Thickness(1.5), CornerRadius = new CornerRadius(4), Padding = new Thickness(6, 1, 6, 1), VerticalAlignment = VerticalAlignment.Center, HorizontalAlignment = HorizontalAlignment.Left,
                    Background = new SolidColorBrush(Color.FromRgb((byte)(lb.Color.R * .62 + 11 * .38), (byte)(lb.Color.G * .62 + 13 * .38), (byte)(lb.Color.B * .62 + 16 * .38))),
                    Child = new TextBlock { Text = lic, Foreground = Brushes.White, FontFamily = (FontFamily)FindResource("FData"), FontSize = 10.5, FontWeight = FontWeights.Bold } };
                Grid.SetColumn(badge, 2);
                row.Children.Add(badge);
            }
            Cell(3, LapTime(t), k == 1 ? B("Pb") : B("Fg"), true, HorizontalAlignment.Right);
            Cell(4, k == 1 ? "" : "+" + (t - first).ToString("0.000"), B("Muted"), true, HorizontalAlignment.Right);
            var created = D(l["created"]);
            Cell(5, created > 0 ? DateTimeOffset.FromUnixTimeMilliseconds((long)created).LocalDateTime.ToString("d") : "", B("Muted"), true, HorizontalAlignment.Right);
            ComRows.Children.Add(border);
        }
    }

    private static string LapTime(double t)
    {
        if (!(t > 0)) return "–";
        int m = (int)(t / 60);
        return $"{m}:{t - m * 60:00.000}";
    }

    // ---------- Account (native) ----------

    private bool _reveal, _need2fa;
    private string _email = "";

    private async Task AccountAsync()
    {
        JsonNode? a;
        try { a = await _engine.GetAsync("/api/sync"); } catch { return; }
        bool signed = Bo(a?["signedIn"]);
        AccSignIn.Visibility = signed ? Visibility.Collapsed : Visibility.Visible;
        AccIn.Visibility = signed ? Visibility.Visible : Visibility.Collapsed;
        if (!signed)
        {
            if (AccEmail.Text == "" && S(a?["email"]) != "") AccEmail.Text = S(a?["email"]);
            if (Bo(a?["ended"]) && AccErr.Visibility != Visibility.Visible) ShowAccErr(T("You were signed out on the server: sign in again.", "Se cerró tu sesión en el servidor: vuelve a entrar."));
            return;
        }
        _email = S(a?["email"]);
        AccEmailV.Text = _reveal ? _email : "••••••";
        if (!AccName.IsKeyboardFocusWithin) AccName.Text = S(a?["display"]);
        AccFlags.Children.Clear();
        AccFlags.Children.Add(Chip(Bo(a?["verified"]) ? T("Email confirmed", "Email confirmado") : T("Email not confirmed", "Email sin confirmar"), Bo(a?["verified"]) ? B("Good") : B("Warn")));
        AccFlags.Children.Add(Chip(Bo(a?["twoFactor"]) ? T("Two-step sign-in on", "Verificación en dos pasos activada") : T("Two-step sign-in off", "Verificación en dos pasos desactivada"), B("Muted")));
        if (Bo(a?["admin"])) AccFlags.Children.Add(Chip("Admin", B("Accent")));
        if (Bo(a?["supporter"])) AccFlags.Children.Add(Chip(T("Supporter", "Supporter"), B("Pb")));
        var last = D(a?["lastSync"]);
        AccSyncV.Text = last > 0 ? T("Last sync: ", "Última sincronización: ") + DateTimeOffset.FromUnixTimeMilliseconds((long)last).LocalDateTime.ToString("g") : T("Not synced yet", "Aún sin sincronizar");
        var err = S(a?["error"]);
        AccSyncErr.Text = err == "" ? "" : T("This PC could not sync: ", "Este PC no pudo sincronizar: ") + err;
        AccSyncErr.Visibility = err == "" ? Visibility.Collapsed : Visibility.Visible;
    }

    private void ShowAccErr(string? m)
    {
        AccErr.Text = m ?? "";
        AccErr.Visibility = string.IsNullOrEmpty(m) ? Visibility.Collapsed : Visibility.Visible;
    }

    private async void OnAccLogin(object sender, RoutedEventArgs e)
    {
        ShowAccErr(null);
        AccLogin.IsEnabled = false;
        try
        {
            if (_need2fa)
            {
                var (_, err2) = await _engine.SendAsync("/api/sync", new { action = "login2fa", code = AccCode.Text.Trim() });
                if (err2 != null) { ShowAccErr(err2); return; }
                _need2fa = false;
                AccCodeBox.Visibility = Visibility.Collapsed;
            }
            else
            {
                var (body, err) = await _engine.SendAsync("/api/sync", new { action = "login", email = AccEmail.Text.Trim(), password = AccPass.Password, lang = Es ? "es" : "en" });
                if (err != null) { ShowAccErr(err); return; }
                if (Bo(body?["twoFactor"])) { _need2fa = true; AccCodeBox.Visibility = Visibility.Visible; AccCode.Focus(); return; }
            }
            AccPass.Password = "";
            await AccountAsync();
        }
        finally { AccLogin.IsEnabled = true; }
    }

    private async void OnAccName(object sender, RoutedEventArgs e)
    {
        var (_, err) = await _engine.SendAsync("/api/sync", new { action = "name", nick = AccName.Text.Trim(), nameKind = "nick" });
        if (err != null) MessageBox.Show(this, err, "Pitlane HQ");
        await AccountAsync();
    }

    private void OnAccReveal(object sender, RoutedEventArgs e)
    {
        _reveal = !_reveal;
        AccEmailV.Text = _reveal ? _email : "••••••";
        AccReveal.Content = _reveal ? T("Hide", "Ocultar") : T("Show", "Mostrar");
    }

    private async void OnAccSync(object sender, RoutedEventArgs e)
    {
        AccSync.IsEnabled = false;
        var (_, err) = await _engine.SendAsync("/api/sync", new { action = "sync" });
        AccSync.IsEnabled = true;
        if (err != null) MessageBox.Show(this, err, "Pitlane HQ");
        await AccountAsync();
    }

    private async void OnAccOut(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show(this, T("Sign out on this PC? Your account and laps stay on the server.", "¿Cerrar sesión en este PC? Tu cuenta y tus vueltas se quedan en el servidor."), "Pitlane HQ", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
        await _engine.SendAsync("/api/sync", new { action = "logout" });
        await AccountAsync();
    }

    // what is not native yet opens the app's own screen
    private void OnAccMore(object sender, RoutedEventArgs e) => OpenInApp("me");
    private void OnSetMore(object sender, RoutedEventArgs e) => OpenInApp("settings");

    private async void OpenInApp(string view)
    {
        foreach (var v in new[] { HomeView, LiveView, OverlaysView, AccountView, SettingsView, CommunityView, AnalysisView }) v.Visibility = Visibility.Collapsed;
        Web.Visibility = Visibility.Visible;
        await EnsureWebAsync();
        if (_webReady && Web.CoreWebView2 != null)
            _ = Web.CoreWebView2.ExecuteScriptAsync($"try{{show({System.Text.Json.JsonSerializer.Serialize(view)})}}catch(e){{location.hash='#{view}'}}");
    }

    // ---------- Settings (native) ----------

    private JsonObject? _set;

    private async Task SettingsAsync()
    {
        try
        {
            var conf = await _engine.GetAsync("/api/config");
            _set = conf?["config"]?.AsObject();
            if (_set == null) return;
            SetStart.IsChecked = Bo(_set["startWithWindows"]);
            SetCloseOv.IsChecked = Bo(_set["closeOnExit"]);
            var br = _set["ui"]?["brakes"];
            var beeps = S(br?["beeps"], "count");
            SetBeepOff.IsChecked = beeps == "off"; SetBeepOne.IsChecked = beeps == "one"; SetBeepCount.IsChecked = beeps != "off" && beeps != "one";
            SetTraffic.IsChecked = br?["traffic"] == null || Bo(br["traffic"]);
            if (!SetVol.IsMouseCaptureWithin) SetVol.Value = Math.Clamp((br?["vol"] == null ? 0.7 : D(br["vol"])) * 100, 5, 100);
            var u = await _engine.GetAsync("/api/update");
            var latest = S(u?["latest"]?["version"]);
            SetUpdV.Text = T("This version: ", "Esta versión: ") + S(u?["version"]) + (Bo(u?["available"]) && latest != "" ? T($" · {latest} is ready", $" · la {latest} está lista") : T(" · up to date", " · al día"));
            SetUpdAuto.IsChecked = Bo(u?["auto"]);
            SetUpdAuto.IsEnabled = Bo(u?["autoWorks"]);
            SetUpdApply.Visibility = Bo(u?["available"]) ? Visibility.Visible : Visibility.Collapsed;
        }
        catch { }
    }

    private async Task SaveSettingsAsync()
    {
        if (_set == null) return;
        _set.Remove("positions");
        await Post("/api/config", _set);
        await SettingsAsync();
    }

    private JsonObject Brakes()
    {
        var ui = _set!["ui"] as JsonObject;
        if (ui == null) { ui = new JsonObject(); _set["ui"] = ui; }
        var br = ui["brakes"] as JsonObject;
        if (br == null) { br = new JsonObject { ["on"] = true, ["beeps"] = "count", ["traffic"] = true, ["vol"] = 0.7 }; ui["brakes"] = br; }
        return br;
    }

    private async void OnSetStart(object sender, RoutedEventArgs e) { if (_set == null) return; _set["startWithWindows"] = SetStart.IsChecked == true; await SaveSettingsAsync(); }
    private async void OnSetCloseOv(object sender, RoutedEventArgs e) { if (_set == null) return; _set["closeOnExit"] = SetCloseOv.IsChecked == true; await SaveSettingsAsync(); }
    private async void OnSetBeeps(object sender, RoutedEventArgs e) { if (_set == null || sender is not RadioButton { Tag: string v }) return; Brakes()["beeps"] = v; await SaveSettingsAsync(); }
    private async void OnSetTraffic(object sender, RoutedEventArgs e) { if (_set == null) return; Brakes()["traffic"] = SetTraffic.IsChecked == true; await SaveSettingsAsync(); }
    private async void OnSetVol(object sender, System.Windows.Input.MouseButtonEventArgs e) { if (_set == null) return; Brakes()["vol"] = Math.Round(SetVol.Value) / 100.0; await SaveSettingsAsync(); }
    private async void OnSetUpdAuto(object sender, RoutedEventArgs e) { await Post("/api/update?action=auto&on=" + (SetUpdAuto.IsChecked == true ? "1" : "0")); await SettingsAsync(); }
    private async void OnSetUpdCheck(object sender, RoutedEventArgs e) { await Post("/api/update?action=check"); await SettingsAsync(); }
    private async void OnSetUpdApply(object sender, RoutedEventArgs e)
    {
        var (_, err) = await _engine.SendAsync("/api/update?action=apply");
        if (err != null) MessageBox.Show(this, err, "Pitlane HQ");
    }

    // ---------- navigation ----------

    private void OnNav(object sender, RoutedEventArgs e)
    {
        if (sender is RadioButton { Tag: string v }) { _view = v; ShowView(v); }
    }

    private async void ShowView(string v)
    {
        if (HomeView == null) return;
        bool native = Native.Contains(v);
        HomeView.Visibility = v == "home" ? Visibility.Visible : Visibility.Collapsed;
        LiveView.Visibility = v == "live" ? Visibility.Visible : Visibility.Collapsed;
        OverlaysView.Visibility = v == "overlays" ? Visibility.Visible : Visibility.Collapsed;
        AccountView.Visibility = v == "me" ? Visibility.Visible : Visibility.Collapsed;
        CommunityView.Visibility = v == "community" ? Visibility.Visible : Visibility.Collapsed;
        AnalysisView.Visibility = v == "laps" ? Visibility.Visible : Visibility.Collapsed;
        SettingsView.Visibility = v == "settings" ? Visibility.Visible : Visibility.Collapsed;
        // hidden, not closed: the app keeps running behind the native screens
        Web.Visibility = native ? Visibility.Hidden : Visibility.Visible;
        if (!_engine.Running) return;
        if (v == "me") await AccountAsync();
        if (v == "community") await CommunityAsync();
        if (v == "laps") await AnalysisAsync();
        if (v == "settings") await SettingsAsync();
        if (v == "overlays") { _ovKey = ""; await OverlaysAsync(); }
        if (v == "home") { _racesKey = ""; await HomeRacesAsync(); }
        if (native) return;
        await EnsureWebAsync();
        if (_webReady && Web.CoreWebView2 != null)
            _ = Web.CoreWebView2.ExecuteScriptAsync($"try{{show({System.Text.Json.JsonSerializer.Serialize(v)})}}catch(e){{location.hash='#{v}'}}");
    }

    private void OnMinimize(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
    private void OnMaximize(object sender, RoutedEventArgs e) => WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    private void OnClose(object sender, RoutedEventArgs e) => Close();

    private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        _poll.Stop();
        _fast.Stop();
        _cts.Cancel();
        _engine.Dispose(); // closing the window stops the engine, like the Go window does
    }
}
