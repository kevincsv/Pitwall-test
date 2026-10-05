package com.pitlanehq.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.ConnectivityManager
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.FrameLayout
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.net.Inet4Address

/**
 * Opens the Pitlane HQ app bundled with the phone (account, planner, races, community:
 * no PC needed). Live telemetry and the rig open the page served by PitlaneHQ.exe on
 * the PC once it is paired with the code it shows; without the PC it falls back to the
 * bundled app.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var loadingRemote = false
    private var onRemote = false // showing the PC's page
    private val prefs by lazy { getSharedPreferences("pitlane", Context.MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) // keep the screen on while racing
        web = WebView(this)
        web.setBackgroundColor(Color.rgb(17, 21, 27))
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true // the bundled app probes the PC on the Wi-Fi and reads its own files
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = true
            allowFileAccess = true
        }
        web.addJavascriptInterface(Bridge(), "PitlaneAndroid")
        web.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) { loadingRemote = false }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame && loadingRemote) showCompanion()
            }
        }
        // the app sits between the status bar (and camera cut-out) and the navigation bar,
        // on every Android version, so nothing is hidden behind them
        val root = FrameLayout(this)
        root.setBackgroundColor(Color.rgb(17, 21, 27))
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        @Suppress("DEPRECATION")
        window.statusBarColor = Color.rgb(17, 21, 27)
        @Suppress("DEPRECATION")
        window.navigationBarColor = Color.rgb(25, 32, 42)
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            root.setOnApplyWindowInsetsListener { v, insets ->
                val i = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                v.setPadding(i.left, i.top, i.right, i.bottom)
                WindowInsets.CONSUMED
            }
        }
        setContentView(root)
        // always start in the phone app; the paired PC opens from Telemetry
        showCompanion()
        handleLink(intent)
    }

    private fun openRemote(url: String) {
        loadingRemote = true
        onRemote = true
        web.loadUrl(url)
        // the PC did not answer in time: show the app without it
        web.postDelayed({ if (loadingRemote) showCompanion() }, 6000)
    }

    private fun showCompanion() {
        loadingRemote = false
        onRemote = false
        web.loadUrl("file:///android_asset/app/index.html")
        web.postDelayed({ web.clearHistory() }, 800)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleLink(intent)
    }

    /** The QR code on the PC: pitlanehq://open?url=http://192.168.x.y:8484/pair?pin=… */
    private fun handleLink(intent: Intent?) {
        val data: Uri = intent?.data ?: return
        if (data.scheme != "pitlanehq") return
        val target = data.getQueryParameter("url") ?: return
        if (!isLanURL(target)) return
        prefs.edit().putString("pc", target.substringBefore("/pair?").trimEnd('/') + "/").apply()
        openRemote(target)
    }

    /** Only PitlaneHQ.exe on the home network: http to a private IPv4 address. */
    private fun isLanURL(u: String): Boolean {
        val uri = try { Uri.parse(u) } catch (e: Exception) { return false }
        if (uri.scheme != "http") return false
        val p = (uri.host ?: return false).split(".").mapNotNull { it.toIntOrNull() }
        if (p.size != 4) return false
        return p[0] == 10 || (p[0] == 192 && p[1] == 168) || (p[0] == 172 && p[1] in 16..31)
    }

    /** The phone's own pages (bundled), not the PC's or any other site. */
    private fun onOwnPage(): Boolean = (web.url ?: "").startsWith("file:///android_asset/")

    private fun callJS(fn: String, value: String) {
        val arg = JSONObject.quote(value)
        web.evaluateJavascript("window.$fn && window.$fn($arg)", null)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // from the PC's page, Back returns to the phone app
        if (onRemote) showCompanion() else if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    /** The phone's Wi-Fi address, used by the connect screen to search the network. */
    private fun localIPv4(): String {
        val cm = getSystemService(ConnectivityManager::class.java)
        val props = cm.getLinkProperties(cm.activeNetwork) ?: return ""
        return props.linkAddresses.map { it.address }.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }?.hostAddress ?: ""
    }

    private fun askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    /** Messages from the pages: window.PitlaneAndroid.post(JSON) */
    inner class Bridge {
        @JavascriptInterface
        fun post(json: String) {
            val msg = try { JSONObject(json) } catch (e: Exception) { return }
            runOnUiThread {
                when (msg.optString("type")) {
                    "ip" -> callJS("onIP", localIPv4())
                    "open" -> msg.optString("url").takeIf { isLanURL(it) }?.let {
                        prefs.edit().putString("pc", it).apply()
                        openRemote(it)
                    }
                    "reset" -> {
                        prefs.edit().remove("pc").apply()
                        showCompanion()
                    }
                    "companion" -> showCompanion()
                    "lastpc" -> callJS("onLastPC", prefs.getString("pc", null) ?: "")
                    // the account keys only go to the phone's own pages
                    "secret-set", "secret-del", "secret-get" -> if (!onOwnPage()) return@runOnUiThread
                }
                when (msg.optString("type")) {
                    "secret-set" -> Secrets.put(this@MainActivity, msg.optString("key"), msg.optString("value"))
                    "secret-del" -> Secrets.remove(this@MainActivity, msg.optString("key"))
                    "secret-get" -> {
                        val key = msg.optString("key")
                        val out = JSONObject().put("key", key).put("value", Secrets.get(this@MainActivity, key) ?: JSONObject.NULL)
                        callJS("onSecret", out.toString())
                    }
                    "notify" -> {
                        askNotifications()
                        Races.save(this@MainActivity, msg)
                        Races.scheduleReminders(this@MainActivity)
                        RacesWidget.refreshAll(this@MainActivity)
                    }
                }
            }
        }
    }
}
