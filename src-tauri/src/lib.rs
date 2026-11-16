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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if !cfg!(any(target_os = "windows", target_os = "android")) {
                return Err("CryptoKeep requires Windows or Android".into());
            }
            let kind = channel(&app.config().identifier)?;
            #[cfg(target_os = "windows")]
            let profile = app.path().app_local_data_dir()?.join("WebView2");
            let config = app.config().app.windows.first().ok_or("Missing main window")?.clone();
            let platform = if cfg!(target_os = "android") { "android" } else { "windows" };
            let marker = format!(
                "Object.defineProperty(globalThis, '__CRYPTOKEEP_DESKTOP__', {{value: Object.freeze({{channel: '{kind}', platform: '{platform}', expectedOrigin: 'https://tauri.localhost'}}), writable: false, configurable: false}});"
            );
            let builder = WebviewWindowBuilder::from_config(app, &config)?;
            #[cfg(target_os = "windows")]
            let builder = builder.data_directory(profile);
            builder
                .use_https_scheme(true)
                .incognito(false)
                .devtools(cfg!(all(debug_assertions, not(target_os = "android"))))
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
