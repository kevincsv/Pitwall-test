using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;

namespace PitlaneHQ.Desktop;

public partial class App : Application
{
    /// <summary>Started with Windows (-minimized), or an update restarting a window that was in the notification
    /// area: the window starts hidden there, never shown by itself.</summary>
    public static bool StartMinimized { get; private set; }

    /// <summary>Pitlane HQ was opened again before the window was ready (while it starts, or while an update hands
    /// over from the old window): the window shows as soon as it is loaded instead of staying hidden.</summary>
    public static bool ShowRequested { get; set; }

    // one Pitlane HQ at a time: a second start brings the open window forward, hidden in the notification area or
    // minimised (never when Windows started it)
    private static Mutex? _single;
    // the running window waits on it: a second start sets it and the window shows (a hidden window has no
    // MainWindowHandle another process could find)
    private static EventWaitHandle? _show;
    private static RegisteredWaitHandle? _showWait;
    // the installer sets it before it replaces or removes the app: everything stops as Quit does, so the icon leaves
    // the notification area (a process killed by force leaves its icon behind)
    private static EventWaitHandle? _quit;
    private static RegisteredWaitHandle? _quitWait;

    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] private static extern bool AllowSetForegroundWindow(int pid);

    protected override void OnStartup(StartupEventArgs e)
    {
        var args = e.Args;
        StartMinimized = args.Any(a => a.Equals("-minimized", StringComparison.OrdinalIgnoreCase));
        int ri = Array.FindIndex(args, a => a.Equals("-replace", StringComparison.OrdinalIgnoreCase));
        int oldPid = 0;
        bool replace = ri >= 0 && ri + 1 < args.Length && int.TryParse(args[ri + 1], out oldPid);
        // local mode (PITLANEHQ_DATA, its own data folder) runs beside the normal window
        var inst = @"Local\PitlaneHQ.Desktop" + (Environment.GetEnvironmentVariable("PITLANEHQ_DATA") ?? "");
        if (!replace)
        {
            _single = new Mutex(true, inst, out bool first);
            if (!first)
            {
                if (!StartMinimized) ShowRunning(inst + ".Show");
                Environment.Exit(0);
                return;
            }
        }
        // waited on before the old window is gone after an update: Pitlane HQ opened again meanwhile reaches this one
        // (the old window lets go of it when it stops) and the new window shows instead of staying hidden
        Listen(inst);
        if (replace)
        {
            // after an update: the old window is closing; this one waits for it before taking its place, and a little
            // longer for the mutex it still holds
            try { using var old = Process.GetProcessById(oldPid); old.WaitForExit(15000); } catch { }
            _single = new Mutex(true, inst, out bool first);
            if (!first)
            {
                try { _single.WaitOne(10000); } catch (AbandonedMutexException) { }
            }
        }
        // Windows shutting down or signing out (the installer's Restart Manager too): everything stops, as Quit does
        SessionEnding += (_, _) => (MainWindow as PitlaneHQ.Desktop.MainWindow)?.Quitting();
        base.OnStartup(e);
        DispatcherUnhandledException += (_, a) =>
        {
            MessageBox.Show(a.Exception.Message, "Pitlane HQ", MessageBoxButton.OK, MessageBoxImage.Error);
            a.Handled = true;
        };
    }

    private void Listen(string inst)
    {
        try
        {
            _show = new EventWaitHandle(false, EventResetMode.AutoReset, inst + ".Show");
            _showWait = ThreadPool.RegisterWaitForSingleObject(_show, (_, _) => Dispatcher.BeginInvoke(OnShowAsked), null, -1, false);
        }
        catch { }
        try
        {
            _quit = new EventWaitHandle(false, EventResetMode.AutoReset, inst + ".Quit");
            _quitWait = ThreadPool.RegisterWaitForSingleObject(_quit, (_, _) => Dispatcher.BeginInvoke(() =>
            {
                if (MainWindow is PitlaneHQ.Desktop.MainWindow w) w.QuitApp();
                else Shutdown();
            }), null, -1, true);
        }
        catch { }
    }

    // Pitlane HQ opened again: the window shows; before it is ready it shows once loaded; a window that is stopping
    // passes it on to the window that takes its place (it no longer waits on the event)
    private void OnShowAsked()
    {
        var w = MainWindow as PitlaneHQ.Desktop.MainWindow;
        if (w is { Stopped: true })
        {
            try { _show?.Set(); } catch { }
            return;
        }
        if (w is { Ready: true }) w.ShowFromTray();
        else ShowRequested = true;
    }

    /// <summary>The window stops: a later start or the installer reach the window that comes next, never this one.</summary>
    public static void StopListening()
    {
        try { _showWait?.Unregister(null); } catch { }
        _showWait = null;
        try { _quitWait?.Unregister(null); } catch { }
        _quitWait = null;
    }

    // a second start: the running window shows and comes forward, even from the notification area
    private static void ShowRunning(string showName)
    {
        AllowSetForegroundWindow(-1); // ASFW_ANY: this start came from the driver, the running window may take the front
        try
        {
            if (EventWaitHandle.TryOpenExisting(showName, out var ev))
            {
                using (ev) ev.Set();
                return;
            }
        }
        catch { }
        // a running window from before the notification area: its handle, as before
        var me = Environment.ProcessId;
        foreach (var p in Process.GetProcessesByName("PitlaneHQ.Desktop"))
        {
            if (p.Id == me || p.MainWindowHandle == IntPtr.Zero) continue;
            if (IsIconic(p.MainWindowHandle)) ShowWindow(p.MainWindowHandle, 9); // SW_RESTORE
            SetForegroundWindow(p.MainWindowHandle);
            break;
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        (MainWindow as PitlaneHQ.Desktop.MainWindow)?.StopAll();
        StopListening();
        _show?.Dispose();
        _quit?.Dispose();
        try { _single?.ReleaseMutex(); } catch { }
        base.OnExit(e);
    }
}
