package com.vertex.engineers.prototype;

import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.*;
import java.io.ByteArrayInputStream;
import java.util.Collections;

public class MainActivity extends Activity {
  private static final String HOST="appassets.androidplatform.net";
  private WebView web;
  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    getWindow().setStatusBarColor(0xff15181c);
    getWindow().setNavigationBarColor(0xff15181c);
    web=new WebView(this);
    web.setBackgroundColor(0xfff4f0e8);
    setContentView(web);
    WebSettings s=web.getSettings();
    s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    web.setWebChromeClient(new WebChromeClient());
    web.setWebViewClient(new WebViewClient(){
      @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
        Uri uri=request.getUrl();if(!HOST.equals(uri.getHost()))return null;
        String path=uri.getPath();if(path==null||path.equals("/"))path="/index.html";if(path.contains(".."))return missing();
        String ext=MimeTypeMap.getFileExtensionFromUrl(path);String mime=MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        if("js".equals(ext))mime="application/javascript";if(mime==null)mime="application/octet-stream";
        try{return new WebResourceResponse(mime,"UTF-8",200,"OK",Collections.singletonMap("Cache-Control","no-store"),getAssets().open("site"+path));}catch(Exception e){return missing();}
      }
      @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){return !HOST.equals(request.getUrl().getHost());}
    });
    web.loadUrl("https://"+HOST+"/index.html");
  }
  private WebResourceResponse missing(){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
  @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else finish();}
  @Override protected void onDestroy(){web.destroy();super.onDestroy();}
}
