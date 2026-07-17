package com.directcheers.touchpay;

import android.os.Bundle;
import android.view.View;
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
}
