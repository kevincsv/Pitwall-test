using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;

namespace TrackIQ.Desktop;

public partial class MainWindow : Window
{
    private readonly Engine _engine = new();
    private readonly DispatcherTimer _poll = new() { Interval = TimeSpan.FromSeconds(2) };
    private readonly CancellationTokenSource _cts = new();
    private bool _webReady;
    private string _view = "home";

    public MainWindow()
    {
        InitializeComponent();
        _poll.Tick += async (_, _) => await RefreshAsync();
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        var exe = Engine.FindExe(Environment.GetCommandLineArgs().Skip(1).ToArray());
        if (exe == null)
        {
            StartError.Text = "TrackIQ.exe was not found. Put TrackIQ.Desktop.exe in the same folder as TrackIQ.exe, or start it with the path of TrackIQ.exe as its first argument.";
            EngineText.Text = "Engine: not found";
            return;
        }
        try
        {
            await _engine.StartAsync(exe, _cts.Token);
            EngineText.Text = "Engine: " + _engine.Base;
            await Web.EnsureCoreWebView2Async();
            Web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            Web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            Web.CoreWebView2.NewWindowRequested += OnNewWindow;
            Web.CoreWebView2.NavigationCompleted += (_, _) => { _webReady = true; Starting.Visibility = Visibility.Collapsed; ShowView(_view); };
            Web.Source = new Uri(_engine.Url + "#" + _view);
            _poll.Start();
            await RefreshAsync();
        }
        catch (Exception ex)
        {
            StartError.Text = ex.Message;
            EngineText.Text = "Engine: failed";
        }
    }

    // links to other sites open in the normal browser, never inside the app
    private void OnNewWindow(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (e.Uri.StartsWith("https://") || e.Uri.StartsWith("http://"))
            Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true });
    }

    private async Task RefreshAsync()
    {
        if (!_engine.Running)
        {
            EngineText.Text = "Engine: stopped";
            ConnDot.Fill = (Brush)FindResource("Bad");
            return;
        }
        try
        {
            var st = Status.From(await _engine.GetAsync("/api/info"), await _engine.GetAsync("/api/now"));
            ConnDot.Fill = (Brush)FindResource(st.Connected ? "Good" : "Bad");
            ConnText.Text = st.Connected ? st.Game + " connected" : "Waiting for " + st.Game;
            TrackText.Text = st.Track == "" ? "–" : st.Track;
            CarText.Text = st.Car == "" ? "–" : st.Car;
            VersionText.Text = st.Version == "" ? "desktop preview" : $"v{st.Version} {st.Stage} · desktop preview";
            AccountText.Text = st.Account == "" ? "iRacing: not signed in" : "iRacing: " + st.Account;
            DemoPill.Visibility = st.Demo ? Visibility.Visible : Visibility.Collapsed;
        }
        catch (Exception ex)
        {
            EngineText.Text = "Engine: " + ex.Message;
        }
    }

    private void OnNav(object sender, RoutedEventArgs e)
    {
        if (sender is RadioButton { Tag: string v }) { _view = v; ShowView(v); }
    }

    // native parts show on Home; every screen also tells the web app which view to open
    private void ShowView(string v)
    {
        if (HomeCard != null) HomeCard.Visibility = v == "home" ? Visibility.Visible : Visibility.Collapsed;
        if (_webReady && Web?.CoreWebView2 != null)
            _ = Web.CoreWebView2.ExecuteScriptAsync($"try{{show({System.Text.Json.JsonSerializer.Serialize(v)})}}catch(e){{location.hash='#{v}'}}");
    }

    private void OnMinimize(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
    private void OnMaximize(object sender, RoutedEventArgs e) => WindowState = WindowState == WindowState.Maximized ? WindowState.Normal : WindowState.Maximized;
    private void OnClose(object sender, RoutedEventArgs e) => Close();

    private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        _poll.Stop();
        _cts.Cancel();
        _engine.Dispose(); // closing the window stops the engine, like the Go window does
    }
}
