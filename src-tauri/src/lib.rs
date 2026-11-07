mod app_paths;
mod gateway_vault;
mod market_data;
mod remote_data;
mod symbol_search;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            remote_data::startup(app.handle());
            let data_dir =
                app_paths::storage_directory(app.path().app_data_dir()?, "market-data.sqlite3");
            std::fs::create_dir_all(&data_dir)?;
            let connection = rusqlite::Connection::open(data_dir.join("market-data.sqlite3"))
                .map_err(|error| {
                    std::io::Error::new(std::io::ErrorKind::Other, error.to_string())
                })?;
            market_data::initialize_database(&connection)
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            app.manage(market_data::AppState::new(connection));
            let window_config = &app.config().app.windows[0];
            let window = tauri::WebviewWindowBuilder::from_config(app, window_config)?;
            // Keep the existing WebView profile (appearance preferences) after
            // the application-ID rename; fresh installs use the new ID's path.
            #[cfg(target_os = "windows")]
            let window = window.data_directory(app_paths::storage_directory(
                app.path().app_local_data_dir()?,
                "EBWebView",
            ));
            window.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            remote_data::get_remote_market_data,
            symbol_search::get_market_search_catalog,
            symbol_search::search_market_instruments,
            market_data::subscribe_market_feed,
            market_data::get_market_bars,
            market_data::get_market_tick_size,
            market_data::unsubscribe_market_feed,
            market_data::query_footprint_history,
            market_data::get_feed_health
        ])
        .run(tauri::generate_context!())
        .expect("error while running DeplyzeView desktop application");
}
