package com.directcheers.touchpay;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    // EnvironmentPickerActivityで選んだ接続先（stg/production/local）を反映する。
    // Capacitorのserver.urlはビルド時にAPKへ焼き込まれる値だが、ここでは
    // バンドル済みcapacitor.config.jsonをアプリ内ファイルにコピーしてserver.urlだけ
    // 上書きし、CapConfig.loadFromFile()で読み直すことで実機上での切り替えを実現する
    // （他の設定＝SystemBarsのplugin設定等はバンドル値のまま維持される）。
    @Override
    public void onCreate(Bundle savedInstanceState) {
        String env = resolveEnvironment(getIntent());
        this.config = buildConfigForEnvironment(env);
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

    // singleTaskのため、アプリ起動中にEnvironmentPickerActivityから戻ってきた場合は
    // onCreateではなくここに来る。選択環境が変わっていればActivityごと作り直して
    // 新しいserver.urlでBridgeを再構築する。QRログインのディープリンク（extraなし）は
    // 素通りしてsuper.onNewIntent()に渡し、既存のNativeDeeplinkListener処理に任せる。
    @Override
    protected void onNewIntent(Intent intent) {
        String newEnv = intent.getStringExtra(EnvironmentPickerActivity.EXTRA_ENVIRONMENT);
        if (newEnv != null) {
            SharedPreferences prefs = getSharedPreferences(EnvironmentPickerActivity.PREFS_NAME, MODE_PRIVATE);
            String currentEnv = prefs.getString(EnvironmentPickerActivity.KEY_ENVIRONMENT, "stg");
            if (!newEnv.equals(currentEnv)) {
                prefs.edit().putString(EnvironmentPickerActivity.KEY_ENVIRONMENT, newEnv).apply();
                setIntent(intent);
                recreate();
                return;
            }
        }
        super.onNewIntent(intent);
    }

    // WebViewのCookieはディスク書き込みが遅延されるため、バックグラウンド移行後に
    // プロセスがOSに終了されるとログインセッションが消える。アプリが背面に回る
    // タイミングで強制フラッシュし、セッションを確実に永続化する。
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    private String resolveEnvironment(Intent intent) {
        String fromIntent = intent != null ? intent.getStringExtra(EnvironmentPickerActivity.EXTRA_ENVIRONMENT) : null;
        if (fromIntent != null) return fromIntent;
        SharedPreferences prefs = getSharedPreferences(EnvironmentPickerActivity.PREFS_NAME, MODE_PRIVATE);
        return prefs.getString(EnvironmentPickerActivity.KEY_ENVIRONMENT, "stg");
    }

    private String resolveServerUrl(String env) {
        switch (env) {
            case "production":
                return "https://direct-cheers.com/dashboard";
            case "local":
                // adb reverse tcp:3000 tcp:3000 が有効なUSB接続開発時のみ動作する
                return "http://localhost:3000/dashboard";
            case "stg":
            default:
                return "https://stg.direct-cheers.com/dashboard";
        }
    }

    private CapConfig buildConfigForEnvironment(String env) {
        String url = resolveServerUrl(env);
        try {
            JSONObject root = new JSONObject(readAssetFile("capacitor.config.json"));
            JSONObject server = root.optJSONObject("server");
            if (server == null) {
                server = new JSONObject();
                root.put("server", server);
            }
            server.put("url", url);
            server.put("cleartext", url.startsWith("http://"));

            File outFile = new File(getFilesDir(), "capacitor.config.json");
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(root.toString().getBytes(StandardCharsets.UTF_8));
            }
            return CapConfig.loadFromFile(this, getFilesDir().getAbsolutePath());
        } catch (IOException | JSONException e) {
            // 失敗時はビルド時にバンドルされたcapacitor.config.jsonのまま起動する
            return CapConfig.loadDefault(this);
        }
    }

    private String readAssetFile(String name) throws IOException {
        try (InputStream is = getAssets().open(name)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
            return bos.toString("UTF-8");
        }
    }
}
