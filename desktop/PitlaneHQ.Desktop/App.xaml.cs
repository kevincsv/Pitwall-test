using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows;

namespace PitlaneHQ.Desktop;

public partial class App : Application
{
    /// <summary>Started with Windows (-minimized): the window opens minimized.</summary>
    public static bool StartMinimized { get; private set; }

    // one Pitlane HQ at a time: a second start brings the open window forward (never when Windows started it)
    private static Mutex? _single;

    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr h);

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
        _single = new Mutex(true, @"Local\PitlaneHQ.Desktop" + (Environment.GetEnvironmentVariable("PITLANEHQ_DATA") ?? ""), out bool first);
        if (!first && ri < 0)
        {
            if (!StartMinimized)
            {
                var me = Environment.ProcessId;
                foreach (var p in Process.GetProcessesByName("PitlaneHQ.Desktop"))
                {
                    if (p.Id == me || p.MainWindowHandle == IntPtr.Zero) continue;
                    if (IsIconic(p.MainWindowHandle)) ShowWindow(p.MainWindowHandle, 9); // SW_RESTORE
                    SetForegroundWindow(p.MainWindowHandle);
                    break;
                }
            }
            Environment.Exit(0);
            return;
        }
        if (!first)
        {
            // the old window still holds it: wait for it a little longer, then carry on
            try { _single.WaitOne(10000); } catch (AbandonedMutexException) { }
        }
        base.OnStartup(e);
        DispatcherUnhandledException += (_, a) =>
        {
            MessageBox.Show(a.Exception.Message, "Pitlane HQ", MessageBoxButton.OK, MessageBoxImage.Error);
            a.Handled = true;
        };
    }

    protected override void OnExit(ExitEventArgs e)
    {
        try { _single?.ReleaseMutex(); } catch { }
        base.OnExit(e);
    }
}
