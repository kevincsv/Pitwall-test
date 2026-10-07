using System.Windows;

namespace TrackIQ.Desktop;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, a) =>
        {
            MessageBox.Show(a.Exception.Message, "TrackIQ", MessageBoxButton.OK, MessageBoxImage.Error);
            a.Handled = true;
        };
    }
}
