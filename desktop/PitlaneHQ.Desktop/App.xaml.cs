using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;

namespace PitlaneHQ.Desktop;

public partial class App : Application
{
    /// <summary>Started with Windows (-minimized), or an update restarting a window that was in the notification
    /// area: the window starts hidden there, never shown by itself.</summary>
    public static bool StartMinimized { get; private set; }

    // one Pitlane HQ at a time: a second start brings the open window forward, hidden in the notification area or
    // minimised (never when Windows started it)
    private static Mutex? _single;
    // the running window waits on it: a second start sets it and the window shows (a hidden window has no
    // MainWindowHandle another process could find)
    private static EventWaitHandle? _show;
    private static RegisteredWaitHandle? _showWait;

    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] private static extern bool AllowSetForegroundWindow(int pid);

    protected override void OnStartup(StartupEventArgs e)
    {
        var args = e.Args;
        StartMinimized = args.Any(a => a.Equals("-minimized", StringComparison.OrdinalIgnoreCase));
        // after an update: the old window is closing; this one waits for it before taking its place
        int ri = Array.FindIndex(args, a => a.Equals("-replace", StringComparison.OrdinalIgnoreCase));
        if (ri >= 0 && ri + 1 < args.Length && int.TryParse(args[ri + 1], out var oldPid))
        {
            try { using var old = Process.GetProcessById(oldPid); old.WaitForExit(15000); } catch { }
        }
        // local mode (PITLANEHQ_DATA, its own data folder) runs beside the normal window
        var inst = @"Local\PitlaneHQ.Desktop" + (Environment.GetEnvironmentVariable("PITLANEHQ_DATA") ?? "");
        _single = new Mutex(true, inst, out bool first);
        if (!first && ri < 0)
        {
            if (!StartMinimized) ShowRunning(inst + ".Show");
            Environment.Exit(0);
            return;
        }
        if (!first)
        {
            // the old window still holds it: wait for it a little longer, then carry on
            try { _single.WaitOne(10000); } catch (AbandonedMutexException) { }
        }
        try
        {
            _show = new EventWaitHandle(false, EventResetMode.AutoReset, inst + ".Show");
            _showWait = ThreadPool.RegisterWaitForSingleObject(_show, (_, _) =>
                Dispatcher.BeginInvoke(() => (MainWindow as PitlaneHQ.Desktop.MainWindow)?.ShowFromTray()), null, -1, false);
        }
        catch { }
        // Windows shutting down or signing out: everything stops, as Quit does
        SessionEnding += (_, _) => (MainWindow as PitlaneHQ.Desktop.MainWindow)?.Quitting();
        base.OnStartup(e);
        DispatcherUnhandledException += (_, a) =>
        {
            MessageBox.Show(a.Exception.Message, "Pitlane HQ", MessageBoxButton.OK, MessageBoxImage.Error);
            a.Handled = true;
        };
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
        try { _showWait?.Unregister(null); } catch { }
        _show?.Dispose();
        try { _single?.ReleaseMutex(); } catch { }
        base.OnExit(e);
    }
}
