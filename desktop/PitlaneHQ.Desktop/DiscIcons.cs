using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace PitlaneHQ.Desktop;

/// <summary>
/// The disciplines' own symbols and colours, the same as Community's in the app (DISC_IC and .c-* in index.html):
/// an oval, a sports car from the side, an open-wheel car from above, an oval with its dust, a dirt track in the hills.
/// </summary>
public partial class MainWindow
{
    private static readonly Dictionary<string, Color> DiscColors = new()
    {
        ["oval"] = Color.FromRgb(0xff, 0xb0, 0x2e), ["sports_car"] = Color.FromRgb(0x5a, 0xa9, 0xff),
        ["formula_car"] = Color.FromRgb(0xb9, 0x8c, 0xff), ["dirt_oval"] = Color.FromRgb(0xc9, 0x9a, 0x5b),
        ["dirt_road"] = Color.FromRgb(0x8f, 0xbf, 0x6a),
    };

    private static Color DiscColor(string id) => DiscColors.TryGetValue(id, out var c) ? c : Color.FromRgb(0x8a, 0x97, 0xa9);

    private static Geometry DiscGeometry(string id)
    {
        var g = new GeometryGroup();
        void R(double x, double y, double w, double h, double r) => g.Children.Add(new RectangleGeometry(new Rect(x, y, w, h), r, r));
        void C(double x, double y, double r) => g.Children.Add(new EllipseGeometry(new Point(x, y), r, r));
        void P(string d) { try { g.Children.Add(Geometry.Parse(d)); } catch { } }
        switch (id)
        {
            case "oval":
                R(2.5, 6, 19, 12, 6); R(7.5, 10, 9, 4, 2); P("M12,6 L12,10");
                break;
            case "sports_car":
                P("M3,15.5 L3,13.3 L5.6,12.4 L8.6,9.4 L14.2,9.4 L17.6,12.4 L20,13 L20,15.5 Z"); C(7.5, 16, 1.8); C(16.5, 16, 1.8);
                P("M9.6,9.4 L9,12.4 L15,12.4 L13.8,9.4");
                break;
            case "formula_car":
                P("M8,4 L16,4 M7,20 L17,20 M12,4 L12,20"); R(10, 9.5, 4, 5, 1.2);
                R(4.5, 6, 3, 4.5, 1); R(16.5, 6, 3, 4.5, 1); R(4.5, 13.5, 3, 4.5, 1); R(16.5, 13.5, 3, 4.5, 1);
                break;
            case "dirt_oval":
                R(2, 6.5, 15, 11, 5.5); R(6, 10.5, 7, 3, 1.5);
                P("M19.5,8.5 L19.51,8.5 M21.5,11.5 L21.51,11.5 M19.8,14.5 L19.81,14.5 M21.6,17 L21.61,17");
                break;
            case "dirt_road":
                P("M2,15 L7,9 L10.5,13 L14,8.5 L22,15"); P("M9,21 C10.5,19 13.5,18.5 14,16");
                P("M4,21 L4.01,21 M18,21 L18.01,21 M20.5,19 L20.51,19");
                break;
        }
        return g;
    }

    /// <summary>The discipline's symbol in its rounded box, like Community's (size: the box's side).</summary>
    private static FrameworkElement DiscIcon(string id, double size)
    {
        var col = DiscColor(id);
        var path = new System.Windows.Shapes.Path
        {
            Data = DiscGeometry(id), Stroke = new SolidColorBrush(col), StrokeThickness = 1.8,
            StrokeStartLineCap = PenLineCap.Round, StrokeEndLineCap = PenLineCap.Round, StrokeLineJoin = PenLineJoin.Round,
            Width = 24, Height = 24, Stretch = Stretch.None,
        };
        var inner = size * 0.55;
        return new Border
        {
            Width = size, Height = size, CornerRadius = new CornerRadius(size * 0.24), BorderThickness = new Thickness(1.5),
            BorderBrush = new SolidColorBrush(col), Background = new SolidColorBrush(Color.FromArgb(0x1f, col.R, col.G, col.B)),
            Child = new Viewbox { Width = inner, Height = inner, Child = path },
        };
    }
}
