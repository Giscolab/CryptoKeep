#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewWindowBuilder};
use tauri::webview::NewWindowResponse;

fn channel(identifier: &str) -> Result<&'static str, &'static str> {
    match identifier {
        "fr.giscolab.cryptokeep" => Ok("production"),
        "fr.giscolab.cryptokeep.dev" => Ok("development"),
        "fr.giscolab.cryptokeep.test" => Ok("test"),
        _ => Err("Unknown CryptoKeep desktop profile"),
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            if !cfg!(target_os = "windows") {
                return Err("CryptoKeep desktop requires Windows WebView2".into());
            }
            let kind = channel(&app.config().identifier)?;
            let profile = app.path().app_local_data_dir()?.join("WebView2");
            let config = app.config().app.windows.first().ok_or("Missing main window")?.clone();
            let marker = format!(
                "Object.defineProperty(globalThis, '__CRYPTOKEEP_DESKTOP__', {{value: Object.freeze({{channel: '{kind}', expectedOrigin: 'https://tauri.localhost'}}), writable: false, configurable: false}});"
            );
            WebviewWindowBuilder::from_config(app, &config)?
                .data_directory(profile)
                .use_https_scheme(true)
                .incognito(false)
                .devtools(cfg!(debug_assertions))
                .initialization_script(&marker)
                .on_navigation(|url| {
                    url.scheme() == "https" && url.host_str() == Some("tauri.localhost")
                        && url.port_or_known_default() == Some(443)
                })
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("CryptoKeep desktop startup refused");
}

#[cfg(test)]
mod tests {
    use super::channel;

    #[test]
    fn known_profiles_are_separate_and_unknown_profiles_are_refused() {
        assert_eq!(channel("fr.giscolab.cryptokeep"), Ok("production"));
        assert!(channel("unknown").is_err());
        assert_eq!(channel("fr.giscolab.cryptokeep.dev"), Ok("development"));
        assert_eq!(channel("fr.giscolab.cryptokeep.test"), Ok("test"));
    }
}
