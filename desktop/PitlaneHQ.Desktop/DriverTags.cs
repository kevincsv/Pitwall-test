using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace PitlaneHQ.Desktop;

/// <summary>
/// The icons of your driver notes (the engine's drivers.go), the same as the overlays' and the app's: danger is a
/// red triangle, careful an amber circle, clean a green one with a tick, friend a blue one with a star.
/// </summary>
public partial class MainWindow
{
    private static readonly Dictionary<string, Color> TagColors = new()
    {
        ["danger"] = Color.FromRgb(0xff, 0x5b, 0x5b), ["careful"] = Color.FromRgb(0xff, 0xb0, 0x2e),
        ["clean"] = Color.FromRgb(0x38, 0xc9, 0x7c), ["friend"] = Color.FromRgb(0x4c, 0x9b, 0xff),
    };

    private string TagLabel(string tag) => tag switch
    {
        "danger" => T("Dangerous", "Peligroso"),
        "careful" => T("Be careful", "Cuidado"),
        "clean" => T("Clean", "Limpio"),
        "friend" => T("Friend", "Amigo"),
        _ => "",
    };

    private static FrameworkElement TagIcon(string tag, double size)
    {
        var c = new Canvas { Width = 16, Height = 16 };
        var col = new SolidColorBrush(TagColors.TryGetValue(tag, out var x) ? x : Colors.Gray);
        var ink = tag == "careful" ? new SolidColorBrush(Color.FromRgb(0x14, 0x17, 0x1c)) : Brushes.White;
        Shape Add(Shape s) { c.Children.Add(s); return s; }
        if (tag == "danger")
        {
            Add(new Polygon { Points = new PointCollection { new Point(8, 0.6), new Point(15.8, 14.6), new Point(0.2, 14.6) }, Fill = col });
            Add(new Line { X1 = 8, Y1 = 5, X2 = 8, Y2 = 9.6, Stroke = ink, StrokeThickness = 1.9, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round });
            Add(new Ellipse { Width = 2.2, Height = 2.2, Fill = ink, Margin = new Thickness(6.9, 11, 0, 0) });
        }
        else
        {
            Add(new Ellipse { Width = 16, Height = 16, Fill = col });
            if (tag == "careful")
            {
                Add(new Line { X1 = 8, Y1 = 3.8, X2 = 8, Y2 = 9, Stroke = ink, StrokeThickness = 1.9, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round });
                Add(new Ellipse { Width = 2.2, Height = 2.2, Fill = ink, Margin = new Thickness(6.9, 10.6, 0, 0) });
            }
            else if (tag == "clean")
                Add(new Polyline { Points = new PointCollection { new Point(4.4, 8.2), new Point(7, 10.9), new Point(11.8, 5.4) }, Stroke = ink, StrokeThickness = 1.9, StrokeLineJoin = PenLineJoin.Round, StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round });
            else if (tag == "friend")
            {
                var star = new PointCollection();
                for (int i = 0; i < 10; i++)
                {
                    double r = i % 2 == 0 ? 5 : 2.1, ang = -Math.PI / 2 + i * Math.PI / 5;
                    star.Add(new Point(8 + r * Math.Cos(ang), 8 + r * Math.Sin(ang)));
                }
                Add(new Polygon { Points = star, Fill = ink });
            }
        }
        return new Viewbox { Width = size, Height = size, Child = c, VerticalAlignment = VerticalAlignment.Center };
    }
}
