using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace PitlaneHQ.Desktop;

/// <summary>
/// The Go engine (PitlaneHQ.exe -engine): started by the shell, it prints the address of its
/// local API with a one-use ticket and the cookie of this run. The shell calls the API with
/// that cookie; the WebView gets its own by opening the ticket address. Closing stdin stops it.
/// </summary>
public sealed class Engine : IDisposable
{
    private Process? _proc;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(4) };

    /// <summary>The address to open in the WebView (with its ticket), e.g. http://localhost:8484/?lt=…</summary>
    public string Url { get; private set; } = "";
    /// <summary>The base of the API, e.g. http://localhost:8484</summary>
    public string Base { get; private set; } = "";
    public string Token { get; private set; } = "";
    public bool Running => _proc is { HasExited: false };

    /// <summary>Finds PitlaneHQ.exe: the first argument, next to this program, or the Program Files install.</summary>
    public static string? FindExe(string[] args)
    {
        var c = new List<string>();
        if (args.Length > 0 && args[0].EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) c.Add(args[0]);
        c.Add(Path.Combine(AppContext.BaseDirectory, "PitlaneHQ.exe"));
        c.Add(Path.Combine(Path.GetDirectoryName(AppContext.BaseDirectory.TrimEnd('\\')) ?? "", "PitlaneHQ.exe"));
        c.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Pitlane HQ", "PitlaneHQ.exe"));
        c.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Pitlane HQ", "PitlaneHQ.exe"));
        return c.FirstOrDefault(File.Exists);
    }

    /// <summary>Starts the engine and waits (up to 20 s) for its address.</summary>
    public async Task StartAsync(string exe, CancellationToken ct)
    {
        var psi = new ProcessStartInfo(exe, "-engine")
        {
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(exe) ?? AppContext.BaseDirectory,
        };
        _proc = Process.Start(psi) ?? throw new InvalidOperationException("Could not start Pitlane HQ Agent");
        _proc.ErrorDataReceived += (_, _) => { };
        _proc.BeginErrorReadLine();
        var deadline = DateTime.UtcNow.AddSeconds(20);
        while (DateTime.UtcNow < deadline && (Url == "" || Token == ""))
        {
            ct.ThrowIfCancellationRequested();
            if (_proc.HasExited) throw new InvalidOperationException("Pitlane HQ Agent stopped while starting");
            var line = await _proc.StandardOutput.ReadLineAsync(ct);
            if (line == null) break;
            if (line.StartsWith("PITLANEHQ_URL=")) Url = line["PITLANEHQ_URL=".Length..].Trim();
            if (line.StartsWith("PITLANEHQ_TOKEN=")) Token = line["PITLANEHQ_TOKEN=".Length..].Trim();
        }
        if (Url == "" || Token == "") throw new InvalidOperationException("Pitlane HQ Agent did not answer (update it from pitlanehq.app)");
        Base = Url[..Url.IndexOf('/', "http://".Length)];
        _http.DefaultRequestHeaders.Add("Cookie", "pw_lt=" + Token);
        // the rest of stdout is the engine's log: keep reading so it never blocks
        _ = Task.Run(async () => { try { while (await _proc.StandardOutput.ReadLineAsync() != null) { } } catch { } });
    }

    public async Task<JsonNode?> GetAsync(string path)
    {
        var s = await _http.GetStringAsync(Base + path);
        return JsonNode.Parse(s);
    }

    public async Task PostAsync(string path, object? body = null)
    {
        using var c = new StringContent(body == null ? "{}" : JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json");
        using var r = await _http.PostAsync(Base + path, c);
        r.EnsureSuccessStatusCode();
    }

    /// <summary>A POST that gives back the engine's answer, or its error message ({"error": …}) instead of throwing.</summary>
    public async Task<(JsonNode? Body, string? Error)> SendAsync(string path, object? body = null)
    {
        try
        {
            using var c = new StringContent(body == null ? "{}" : JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json");
            using var r = await _http.PostAsync(Base + path, c);
            var text = await r.Content.ReadAsStringAsync();
            JsonNode? n = null;
            try { n = JsonNode.Parse(text); } catch { }
            if (!r.IsSuccessStatusCode) return (n, n?["error"]?.ToString() ?? text.Trim());
            return (n, null);
        }
        catch (Exception ex) { return (null, ex.Message); }
    }

    public void Dispose()
    {
        try
        {
            if (_proc is { HasExited: false })
            {
                _proc.StandardInput.Close(); // the engine quits when stdin closes
                if (!_proc.WaitForExit(3000)) _proc.Kill(true);
            }
        }
        catch { }
        _proc?.Dispose();
        _http.Dispose();
    }
}

/// <summary>What /api/info and /api/now say, for the native screens.</summary>
public sealed record Status(bool Connected, string Game, string Track, string Car, string Version, string Stage, string Account, bool Demo)
{
    public static Status From(JsonNode? info, JsonNode? now)
    {
        var acc = info?["account"];
        var game = now?["game"]?.ToString() ?? "";
        return new Status(
            now?["connected"]?.GetValue<bool>() ?? false,
            game == "" || game == "auto" ? "iRacing" : game == "lmu" ? "Le Mans Ultimate" : game,
            now?["track"]?.ToString() ?? "",
            now?["car"]?.ToString() ?? "",
            info?["version"]?.ToString() ?? "",
            info?["stage"]?.ToString() ?? "",
            acc?["loggedIn"]?.GetValue<bool>() == true ? (acc?["username"]?.ToString() ?? "iRacing signed in") : "",
            now?["demo"]?.GetValue<bool>() ?? false);
    }
}
