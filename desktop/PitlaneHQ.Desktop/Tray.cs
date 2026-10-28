using System.Globalization;
using WinForms = System.Windows.Forms;

namespace PitlaneHQ.Desktop;

/// <summary>
/// Pitlane HQ's icon in Windows' notification area, for as long as the window runs (like Steam or Garage 61): a click
/// opens the window, its menu opens it or quits. It never shows a balloon or a toast (no Windows notifications).
/// </summary>
public sealed class Tray : IDisposable
{
    private readonly WinForms.NotifyIcon _icon;
    private readonly WinForms.ContextMenuStrip _menu;
    private readonly WinForms.ToolStripMenuItem _open, _quit;
    private string _lang = "";

    /// <summary>The window is asked for (a click, a double click or "Open Pitlane HQ").</summary>
    public event Action? Open;
    /// <summary>"Quit": everything stops, as closing the window did before.</summary>
    public event Action? Quit;

    public Tray(string lang)
    {
        _open = new WinForms.ToolStripMenuItem();
        _open.Font = new System.Drawing.Font(_open.Font, System.Drawing.FontStyle.Bold); // what a click does
        _open.Click += (_, _) => Open?.Invoke();
        _quit = new WinForms.ToolStripMenuItem();
        _quit.Click += (_, _) => Quit?.Invoke();
        _menu = new WinForms.ContextMenuStrip();
        _menu.Items.AddRange(new WinForms.ToolStripItem[] { _open, new WinForms.ToolStripSeparator(), _quit });
        _icon = new WinForms.NotifyIcon { Text = "Pitlane HQ", Icon = LoadIcon(), ContextMenuStrip = _menu };
        _icon.MouseClick += (_, e) => { if (e.Button == WinForms.MouseButtons.Left) Open?.Invoke(); };
        _icon.MouseDoubleClick += (_, e) => { if (e.Button == WinForms.MouseButtons.Left) Open?.Invoke(); };
        SetLanguage(lang);
        _icon.Visible = true;
    }

    /// <summary>Windows' own language (en, es or pt) until the app's page says which it uses.</summary>
    public static string WindowsLanguage() => CultureInfo.CurrentUICulture.TwoLetterISOLanguageName switch
    {
        "es" => "es",
        "pt" => "pt",
        _ => "en",
    };

    /// <summary>The menu in the app's language: en, es or pt (German and bilingual from before read English and Spanish).</summary>
    public void SetLanguage(string lang)
    {
        lang = lang switch { "es" or "both" => "es", "pt" => "pt", _ => "en" };
        if (lang == _lang) return;
        _lang = lang;
        _open.Text = lang switch { "es" => "Abrir Pitlane HQ", "pt" => "Abrir o Pitlane HQ", _ => "Open Pitlane HQ" };
        _quit.Text = lang switch { "es" => "Salir", "pt" => "Sair", _ => "Quit" };
    }

    // the app's icon (assets/pitlanehq.ico, embedded) at the notification area's size; the program's own as a fallback
    private static System.Drawing.Icon LoadIcon()
    {
        try
        {
            using var s = typeof(Tray).Assembly.GetManifestResourceStream("pitlanehq.ico");
            if (s != null) return new System.Drawing.Icon(s, WinForms.SystemInformation.SmallIconSize);
        }
        catch { }
        try
        {
            if (Environment.ProcessPath is { } p && System.Drawing.Icon.ExtractAssociatedIcon(p) is { } i) return i;
        }
        catch { }
        return System.Drawing.SystemIcons.Application;
    }

    public void Dispose()
    {
        _icon.Visible = false; // gone at once, never left behind until the mouse passes over it
        _icon.Dispose();
        _menu.Dispose();
    }
}
