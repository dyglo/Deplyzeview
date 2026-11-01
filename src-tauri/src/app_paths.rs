use std::path::PathBuf;

/// Legacy identifiers only locate existing user data; application identity,
/// binaries and all new installations use com.deplyzeview.desktop.
pub fn storage_directory(current: PathBuf, marker: &str) -> PathBuf {
    if !current.join(marker).exists() {
        if let Some(parent) = current.parent() {
            let legacy = parent.join("com.velaterminal.desktop");
            if legacy.join(marker).exists() {
                return legacy;
            }
        }
    }
    current
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn renamed_app_keeps_existing_data_but_prefers_current_data() {
        let root = std::env::temp_dir().join(format!(
            "deplyzeview-paths-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let current = root.join("com.deplyzeview.desktop");
        let legacy = root.join("com.velaterminal.desktop");
        assert_eq!(
            storage_directory(current.clone(), "market-data.sqlite3"),
            current
        );
        std::fs::create_dir_all(&legacy).unwrap();
        std::fs::write(legacy.join("market-data.sqlite3"), b"legacy").unwrap();
        assert_eq!(
            storage_directory(current.clone(), "market-data.sqlite3"),
            legacy
        );
        std::fs::create_dir_all(&current).unwrap();
        std::fs::write(current.join("market-data.sqlite3"), b"current").unwrap();
        assert_eq!(
            storage_directory(current.clone(), "market-data.sqlite3"),
            current
        );
        std::fs::create_dir_all(legacy.join("EBWebView")).unwrap();
        assert_eq!(storage_directory(current.clone(), "EBWebView"), legacy);
        std::fs::remove_dir_all(root).unwrap();
    }
}
