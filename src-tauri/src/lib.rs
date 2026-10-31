mod market_data;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let connection = rusqlite::Connection::open(data_dir.join("market-data.sqlite3"))
                .map_err(|error| {
                    std::io::Error::new(std::io::ErrorKind::Other, error.to_string())
                })?;
            market_data::initialize_database(&connection)
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            app.manage(market_data::AppState::new(connection));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            market_data::subscribe_market_feed,
            market_data::get_market_bars,
            market_data::unsubscribe_market_feed,
            market_data::query_footprint_history,
            market_data::get_feed_health
        ])
        .run(tauri::generate_context!())
        .expect("error while running Vela desktop application");
}
