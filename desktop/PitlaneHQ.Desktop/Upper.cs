using System.Globalization;
using System.Windows.Data;

namespace PitlaneHQ.Desktop;

// the web's buttons, tabs and titles are upper case (text-transform): WPF has no such thing, so their templates show
// their text through this; anything that is not text (an icon, a row) goes through unchanged
public sealed class UpperConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is string s ? s.ToUpperInvariant() : value;

    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => Binding.DoNothing;
}

// the icon of a main tab (the web's tab icons, 24×24 like an SVG viewBox), drawn by NavButton's template
public static class Ui
{
    public static readonly System.Windows.DependencyProperty IconProperty = System.Windows.DependencyProperty.RegisterAttached(
        "Icon", typeof(System.Windows.Media.Geometry), typeof(Ui), new System.Windows.FrameworkPropertyMetadata(null));

    public static System.Windows.Media.Geometry? GetIcon(System.Windows.DependencyObject o) => (System.Windows.Media.Geometry?)o.GetValue(IconProperty);
    public static void SetIcon(System.Windows.DependencyObject o, System.Windows.Media.Geometry? v) => o.SetValue(IconProperty, v);
}
