using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using GameReaderCommon;
using SimHub.Plugins;

namespace PitlaneHQ.SimHub
{
    // The Pitlane HQ plugin for SimHub: what the Pitlane HQ Agent on this PC works out (the delta bar's delta, the
    // coach's next corner and tip, the lap valid or not) as SimHub properties, "PitlaneHQ.<name>", for dashboards and
    // LEDs. It reads the agent's /api/simhub with the key the agent leaves in simhub.json (simhub.go in the agent).
    [PluginDescription("Pitlane HQ's delta, coach and lap validity as SimHub properties")]
    [PluginAuthor("Pitlane HQ")]
    [PluginName("Pitlane HQ")]
    public class PitlaneHQ : IPlugin, IDataPlugin
    {
        // the frame's shape this plugin reads (simhubFeedVersion in the agent)
        const int FeedVersion = 1;

        public PluginManager PluginManager { get; set; }

        volatile Dictionary<string, object> frame = new Dictionary<string, object>();
        volatile string status = "no-agent";
        volatile bool stopping;
        Thread reader;
        HttpWebResponse open;

        public void Init(PluginManager pluginManager)
        {
            // Status: "ok", "no-agent" (Pitlane HQ is not running), "off" (Pitlane HQ has it turned off), "old"
            // (Pitlane HQ is newer than this plugin)
            this.AttachDelegate("Status", () => status);
            this.AttachDelegate("Connected", () => status == "ok" && Bool("connected") == true);
            this.AttachDelegate("Delta", () => Num("delta"));
            this.AttachDelegate("CoachReference", () => Str("coachRef"));
            this.AttachDelegate("CoachDelta", () => Num("coachDelta"));
            this.AttachDelegate("CoachTurn", () => Str("coachTurn"));
            this.AttachDelegate("CoachDistance", () => Num("coachDist"));
            this.AttachDelegate("CoachTip", () => Str("coachTip"));
            this.AttachDelegate("CoachCue", () => Str("coachCue"));
            this.AttachDelegate("CoachLost", () => Num("coachLost"));
            this.AttachDelegate("LastTurn", () => Str("lastTurn"));
            this.AttachDelegate("LastTurnGain", () => Num("lastTurnGain"));
            this.AttachDelegate("Lap", () => Num("lap"));
            this.AttachDelegate("LapValid", () => Bool("lapValid"));
            this.AttachDelegate("LastLap", () => Num("lastLap"));
            this.AttachDelegate("LastLapValid", () => Bool("lastLapValid"));

            reader = new Thread(ReadLoop) { IsBackground = true, Name = "Pitlane HQ" };
            reader.Start();
        }

        // SimHub's own game data is not needed: everything comes from the agent
        public void DataUpdate(PluginManager pluginManager, ref GameData data) { }

        public void End(PluginManager pluginManager)
        {
            stopping = true;
            try { open?.Close(); } catch { }
        }

        double? Num(string k)
        {
            return frame.TryGetValue(k, out var v) && v != null ? Convert.ToDouble(v) : (double?)null;
        }

        bool? Bool(string k)
        {
            return frame.TryGetValue(k, out var v) && v is bool b ? b : (bool?)null;
        }

        string Str(string k)
        {
            return frame.TryGetValue(k, out var v) && v is string s ? s : "";
        }

        // ReadLoop: on the agent's stream while SimHub runs, back on it 2 s after the agent closes or restarts
        void ReadLoop()
        {
            var json = new JavaScriptSerializer();
            while (!stopping)
            {
                try
                {
                    Read(json);
                }
                catch (Exception)
                {
                    if (status == "ok") status = "no-agent";
                }
                frame = new Dictionary<string, object>();
                for (var i = 0; i < 20 && !stopping; i++) Thread.Sleep(100);
            }
        }

        void Read(JavaScriptSerializer json)
        {
            // the agent writes its port and a new key every run: read again on every connection
            var cfgPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PitlaneHQ", "simhub.json");
            if (!File.Exists(cfgPath))
            {
                status = "no-agent";
                return;
            }
            var cfg = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(cfgPath));
            var port = Convert.ToInt32(cfg["port"]);
            var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/simhub");
            req.Headers["X-PitlaneHQ-Key"] = (string)cfg["key"];
            req.Proxy = null;
            req.Timeout = 3000;
            req.ReadWriteTimeout = 5000;
            HttpWebResponse resp;
            try
            {
                resp = (HttpWebResponse)req.GetResponse();
            }
            catch (WebException e) when (e.Response is HttpWebResponse r && (int)r.StatusCode == 409)
            {
                status = "off";
                return;
            }
            using (resp)
            using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                open = resp;
                string line, ev = "";
                while (!stopping && (line = sr.ReadLine()) != null)
                {
                    if (line.StartsWith("event: "))
                    {
                        ev = line.Substring(7);
                        if (ev == "off") status = "off";
                        continue;
                    }
                    if (!line.StartsWith("data: ") || ev == "off")
                    {
                        if (line.Length == 0) ev = "";
                        continue;
                    }
                    var f = json.Deserialize<Dictionary<string, object>>(line.Substring(6));
                    if (f.TryGetValue("v", out var v) && Convert.ToInt32(v) > FeedVersion)
                    {
                        status = "old";
                        return;
                    }
                    frame = f;
                    status = "ok";
                }
                open = null;
                if (status == "ok") status = "no-agent"; // the agent closed
            }
        }
    }
}
