#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::PathBuf};
use tauri::{Manager, Wry};
use tauri_plugin_fs::FsExt;

#[tauri::command]
fn app_name() -> &'static str {
  "Imudist"
}

#[tauri::command]
fn remember_recent_file(app: tauri::AppHandle<Wry>, path: String) -> Result<(), String> {
  let path = PathBuf::from(path);
  let is_document = path.extension().and_then(|extension| extension.to_str()).map(|extension| extension.eq_ignore_ascii_case("imudist")) == Some(true);
  if !path.is_absolute() || !path.is_file() || !is_document {
    return Err("Only existing Imudist documents can be remembered.".into());
  }

  app.fs_scope().allow_file(&path).map_err(|error| error.to_string())?;
  let recent_file = app.path().app_local_data_dir().map_err(|error| error.to_string())?.join("recent-files.json");
  let mut paths: Vec<String> = fs::read_to_string(&recent_file)
    .ok()
    .and_then(|contents| serde_json::from_str(&contents).ok())
    .unwrap_or_default();
  let path = path.to_string_lossy().into_owned();
  paths.retain(|known| !known.eq_ignore_ascii_case(&path));
  paths.insert(0, path);
  paths.truncate(10);
  let parent = recent_file.parent().ok_or_else(|| "Could not resolve app data directory.".to_owned())?;
  fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  fs::write(recent_file, serde_json::to_vec(&paths).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      let recent_file = app.path().app_local_data_dir()?.join("recent-files.json");
      if let Ok(contents) = fs::read_to_string(recent_file) {
        if let Ok(paths) = serde_json::from_str::<Vec<String>>(&contents) {
          for path in paths {
            let path = PathBuf::from(path);
            let is_document = path.extension().and_then(|extension| extension.to_str()).map(|extension| extension.eq_ignore_ascii_case("imudist")) == Some(true);
            if path.is_file() && is_document {
              if let Err(error) = app.fs_scope().allow_file(path) {
                eprintln!("Could not restore recent document access: {error}");
              }
            }
          }
        }
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![app_name, remember_recent_file])
    .run(tauri::generate_context!())
    .expect("error while running Imudist");
}
