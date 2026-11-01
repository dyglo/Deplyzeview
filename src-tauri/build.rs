fn main() {
    println!("cargo:rerun-if-env-changed=DEPLYZEVIEW_GATEWAY_URL");
    tauri_build::build()
}
