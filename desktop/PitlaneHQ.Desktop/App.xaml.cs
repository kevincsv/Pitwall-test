using System.Windows;

namespace PitlaneHQ.Desktop;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, a) =>
        {
            MessageBox.Show(a.Exception.Message, "Pitlane HQ", MessageBoxButton.OK, MessageBoxImage.Error);
            a.Handled = true;
        };
    }
}
