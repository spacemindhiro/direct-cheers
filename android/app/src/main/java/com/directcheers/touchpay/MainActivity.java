package com.directcheers.touchpay;

import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // サイトはviewport-fit=coverを宣言しているがsafe-area CSS対応を持たないため、
        // Capacitor標準のインセット処理（SystemBars, insetsHandling=cssの
        // パススルー）ではステータスバーとページヘッダが重なってしまう。
        // SystemBarsのインセット処理はcapacitor.config.tsでdisableにし、
        // ここでコンテンツ全体をシステムバーの内側に収める。
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            boolean imeVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime());
            v.setPadding(
                bars.left,
                bars.top,
                bars.right,
                imeVisible ? Math.max(ime.bottom, bars.bottom) : bars.bottom
            );
            return WindowInsetsCompat.CONSUMED;
        });
    }

    // WebViewのCookieはディスク書き込みが遅延されるため、バックグラウンド移行後に
    // プロセスがOSに終了されるとログインセッションが消える。アプリが背面に回る
    // タイミングで強制フラッシュし、セッションを確実に永続化する。
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
