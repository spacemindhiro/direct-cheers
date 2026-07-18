package com.directcheers.touchpay;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.Button;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

// アプリのランチャー起動先。MainActivity（Capacitor Bridge）はビルド時に
// server.urlを1つしか持てないため、実機での検証を素早く切り替えられるよう
// 起動時にここで接続先環境を選ばせ、選択をMainActivity起動時のIntent extraで渡す。
// 選択はSharedPreferencesに記憶し、次回以降は選ばずに使い続けることもできる
// （このActivityは常に経由するが、QRログインのディープリンクはMainActivityへ
// 直接飛ぶため前回の選択がそのまま使われる）。
public class EnvironmentPickerActivity extends AppCompatActivity {

    static final String PREFS_NAME = "dc_env_prefs";
    static final String KEY_ENVIRONMENT = "dc_environment";
    static final String EXTRA_ENVIRONMENT = "dc_environment";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_environment_picker);

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String lastEnv = prefs.getString(KEY_ENVIRONMENT, null);
        if (lastEnv != null) {
            TextView tvLast = findViewById(R.id.tv_last_env);
            tvLast.setText("前回: " + labelFor(lastEnv));
        }

        findViewById(R.id.btn_env_stg).setOnClickListener(v -> selectEnvironment("stg"));
        findViewById(R.id.btn_env_production).setOnClickListener(v -> selectEnvironment("production"));
        findViewById(R.id.btn_env_local).setOnClickListener(v -> selectEnvironment("local"));
    }

    private String labelFor(String env) {
        switch (env) {
            case "production": return "本番環境";
            case "local": return "ローカル開発";
            default: return "STG";
        }
    }

    private void selectEnvironment(String env) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putString(KEY_ENVIRONMENT, env).apply();
        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra(EXTRA_ENVIRONMENT, env);
        startActivity(intent);
        finish();
    }
}
