package com.vertex.demo;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.*;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.util.Collections;
import java.util.Locale;
import android.speech.tts.TextToSpeech;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;
    private TextToSpeech speech;
    private boolean speechReady;
    private static final int SAVE_CSV = 1201;
    private String pendingCsv;
    private boolean trusted(String url) {
        Uri u = Uri.parse(url);
        return "https".equals(u.getScheme()) && HOST.equals(u.getHost());
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        speech = new TextToSpeech(this, status -> speechReady = status == TextToSpeech.SUCCESS);
        getWindow().setStatusBarColor(0xff334b3e);
        getWindow().setNavigationBarColor(0xff334b3e);
        web = new WebView(this);
        web.setBackgroundColor(0xfffaf9f5);
        web.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
                if (message.startsWith("vertex-download:")) {
                    if (!trusted(url) || pendingCsv != null) { result.cancel(); return true; }
                    try {
                        JSONObject req = new JSONObject(message.substring(16));
                        String text = req.optString("text"), name = req.optString("name");
                        if (text.length() > 1000000 || !name.matches("Vertex-demo-[A-Za-z0-9-]{1,60}\\.csv")) {
                            result.cancel(); return true;
                        }
                        pendingCsv = text;
                        Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        save.addCategory(Intent.CATEGORY_OPENABLE);
                        save.setType("text/csv");
                        save.putExtra(Intent.EXTRA_TITLE, name);
                        startActivityForResult(save, SAVE_CSV);
                        result.confirm("dialog-opened");
                    } catch (Exception error) { pendingCsv = null; result.cancel(); }
                    return true;
                }
                if (!message.startsWith("vertex-tts:")) return super.onJsPrompt(view, url, message, defaultValue, result);
                Uri origin = Uri.parse(url);
                if (!"https".equals(origin.getScheme()) || !HOST.equals(origin.getHost())) { result.cancel(); return true; }
                try {
                    JSONObject request = new JSONObject(message.substring(11));
                    if ("stop".equals(request.optString("action"))) { if (speech != null) speech.stop(); result.confirm("ok"); return true; }
                    if (!speechReady) { result.confirm("not-ready"); return true; }
                    String text = request.optString("text");
                    if (text.isEmpty() || text.length() > 6000) { result.confirm("invalid"); return true; }
                    int available = speech.setLanguage(Locale.forLanguageTag(request.optString("lang", "ru-RU")));
                    if (available == TextToSpeech.LANG_MISSING_DATA || available == TextToSpeech.LANG_NOT_SUPPORTED) { result.confirm("missing-language"); return true; }
                    int state = speech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "vertex-concierge");
                    result.confirm(state == TextToSpeech.SUCCESS ? "ok" : "error");
                } catch (Exception error) { result.confirm("error"); }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                Uri origin = Uri.parse(url);
                if ("https".equals(origin.getScheme()) && HOST.equals(origin.getHost()))
                    view.evaluateJavascript("window.vertexNativeVoice = true; window.vertexNativeDownloads = true;", null);
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!HOST.equals(uri.getHost())) return null;
                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                if (path.contains("..")) return missing();
                String ext = MimeTypeMap.getFileExtensionFromUrl(path);
                String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                if (ext.equals("js")) mime = "application/javascript";
                if (ext.equals("webmanifest")) mime = "application/manifest+json";
                if (mime == null) mime = "application/octet-stream";
                try {
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", Collections.singletonMap("Cache-Control", "no-store"), getAssets().open("site" + path));
                } catch (Exception e) { return missing(); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) return false;
                if (!request.isForMainFrame() && "https".equals(uri.getScheme()) && "www.openstreetmap.org".equals(uri.getHost())) return false;
                if ("tel".equals(uri.getScheme()) && request.isForMainFrame()) {
                    try { startActivity(new Intent(Intent.ACTION_DIAL, uri)); }
                    catch (Exception e) { Toast.makeText(MainActivity.this, "Приложение телефона недоступно", Toast.LENGTH_SHORT).show(); }
                    return true;
                }
                if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (Exception e) { Toast.makeText(MainActivity.this, "Для карты нужен браузер", Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
        });
        web.loadUrl("https://" + HOST + "/index.html");
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != SAVE_CSV) return;
        String csv = pendingCsv;
        pendingCsv = null;
        if (resultCode != RESULT_OK || data == null || data.getData() == null || csv == null) return;
        try (java.io.OutputStream out = getContentResolver().openOutputStream(data.getData())) {
            if (out == null) throw new java.io.IOException("No output stream");
            out.write(csv.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            Toast.makeText(this, "CSV сохранён / CSV saved", Toast.LENGTH_SHORT).show();
        } catch (Exception e) { Toast.makeText(this, "Не удалось сохранить CSV / Save failed", Toast.LENGTH_LONG).show(); }
    }
    private WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("(() => { const dialogs=document.querySelectorAll('dialog[open]'); const d=dialogs[dialogs.length-1]; if(d){d.close();return true;} return false; })()", handled -> {
            if (!"true".equals(handled)) { if (web.canGoBack()) web.goBack(); else finish(); }
        });
    }
    @Override protected void onPause() { if (speech != null) speech.stop(); super.onPause(); }
    @Override protected void onDestroy() { if (speech != null) { speech.stop(); speech.shutdown(); } web.destroy(); super.onDestroy(); }
}

