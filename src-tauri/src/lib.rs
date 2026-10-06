#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::{
  fs,
  path::PathBuf,
  process::Command,
  sync::atomic::{AtomicU64, Ordering},
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, Wry};
use tauri_plugin_fs::FsExt;

static EPS_TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);
const MAX_EPS_BYTES: usize = 50 * 1024 * 1024;
const MAX_PDF_BYTES: u64 = 100 * 1024 * 1024;

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

const MAX_LINKED_IMAGE_BYTES: u64 = 50 * 1024 * 1024;
const LINKED_IMAGE_EXTENSIONS: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];

#[derive(serde::Serialize)]
struct LinkStat {
  size: u64,
  /// last modification, milliseconds since the Unix epoch
  mtime: u64,
}

/// A linked picture's path comes out of a saved document, so only absolute paths of picture files are ever touched.
fn linked_image_path(path: &str) -> Result<PathBuf, String> {
  let path = PathBuf::from(path);
  let is_picture = path
    .extension()
    .and_then(|extension| extension.to_str())
    .map(|extension| LINKED_IMAGE_EXTENSIONS.iter().any(|known| extension.eq_ignore_ascii_case(known)))
    == Some(true);
  if !path.is_absolute() || !is_picture {
    return Err("Only absolute paths of picture files can be linked.".into());
  }
  Ok(path)
}

fn stat_of(path: &str) -> Option<LinkStat> {
  let path = linked_image_path(path).ok()?;
  let metadata = fs::metadata(path).ok().filter(|metadata| metadata.is_file())?;
  let mtime = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64;
  Some(LinkStat { size: metadata.len(), mtime })
}

#[tauri::command]
async fn read_linked_image(path: String) -> Result<tauri::ipc::Response, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let path = linked_image_path(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
      return Err("The linked picture is not a file.".to_owned());
    }
    if metadata.len() > MAX_LINKED_IMAGE_BYTES {
      return Err("The linked picture is too large (over 50MB).".to_owned());
    }
    fs::read(&path).map(tauri::ipc::Response::new).map_err(|error| error.to_string())
  })
  .await
  .map_err(|error| error.to_string())?
}

/// The size and modification time of each path, or null for a file that is missing: how the app notices a changed or lost link.
#[tauri::command]
async fn stat_linked_images(paths: Vec<String>) -> Result<Vec<Option<LinkStat>>, String> {
  tauri::async_runtime::spawn_blocking(move || paths.iter().map(|path| stat_of(path)).collect())
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn convert_eps_to_pdf(source_base64: String) -> Result<String, String> {
  let source = STANDARD.decode(source_base64).map_err(|_| "לא ניתן לקרוא את נתוני קובץ ה-EPS.".to_owned())?;
  if source.len() > MAX_EPS_BYTES {
    return Err("קובץ ה-EPS גדול מדי (מעל 50MB).".into());
  }
  if !source.starts_with(b"%!") {
    return Err("הקובץ אינו EPS/PostScript תקין.".into());
  }

  let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
  let temp_dir = std::env::temp_dir().join(format!("imudist-eps-{}-{nonce}-{}", std::process::id(), EPS_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed)));
  let result = (|| {
    fs::create_dir(&temp_dir).map_err(|error| format!("לא ניתן ליצור תיקיית המרה זמנית: {error}"))?;
    let input_path = temp_dir.join("source.eps");
    let output_path = temp_dir.join("converted.pdf");
    fs::write(&input_path, source).map_err(|error| format!("לא ניתן לכתוב את קובץ ה-EPS הזמני: {error}"))?;

    let input_arg = input_path.to_string_lossy().into_owned();
    let output_arg = format!("-sOutputFile={}", output_path.to_string_lossy());
    let mut executables = if cfg!(windows) {
      vec![PathBuf::from("gswin64c.exe"), PathBuf::from("gswin32c.exe"), PathBuf::from("gs")]
    } else {
      vec![PathBuf::from("gs")]
    };
    if cfg!(windows) {
      for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
        let Some(program_files) = std::env::var_os(variable) else { continue };
        let versions_dir = PathBuf::from(program_files).join("gs");
        let mut versions: Vec<PathBuf> = fs::read_dir(versions_dir)
          .into_iter()
          .flatten()
          .filter_map(Result::ok)
          .map(|entry| entry.path())
          .collect();
        versions.sort();
        versions.reverse();
        for version in versions {
          for binary in ["gswin64c.exe", "gswin32c.exe"] {
            let candidate = version.join("bin").join(binary);
            if candidate.is_file() { executables.push(candidate); }
          }
        }
      }
    }
    let mut found_ghostscript = false;
    let mut last_error = String::new();
    for executable in executables {
      let mut child = match Command::new(&executable)
        .args(["-dSAFER", "-dBATCH", "-dNOPAUSE", "-dEPSCrop", "-dQUIET", "-sDEVICE=pdfwrite", output_arg.as_str(), input_arg.as_str()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
      {
        Ok(child) => child,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
        Err(error) => return Err(format!("לא ניתן להפעיל את Ghostscript: {error}")),
      };
      found_ghostscript = true;
      let started = Instant::now();
      let status = loop {
        if let Some(status) = child.try_wait().map_err(|error| format!("שגיאה בזמן המרת EPS: {error}"))? {
          break status;
        }
        if started.elapsed() > Duration::from_secs(30) {
          let _ = child.kill();
          let _ = child.wait();
          return Err("המרת קובץ ה-EPS נמשכה יותר מדי זמן והופסקה.".into());
        }
        std::thread::sleep(Duration::from_millis(40));
      };
      if !status.success() {
        let mut stderr = String::new();
        if let Some(stream) = child.stderr.take() {
          use std::io::Read;
          let _ = stream.take(4096).read_to_string(&mut stderr);
        }
        last_error = stderr.trim().to_owned();
        continue;
      }
      break;
    }
    if !found_ghostscript {
      return Err("לא נמצא Ghostscript. התקן Ghostscript או הוסף את תיקיית bin שלו למשתנה PATH.".into());
    }
    if !output_path.is_file() {
      return Err(if last_error.is_empty() { "Ghostscript לא יצר קובץ PDF וקטורי.".into() } else { format!("Ghostscript לא הצליח להמיר את הקובץ: {last_error}") });
    }
    let metadata = fs::metadata(&output_path).map_err(|error| format!("לא ניתן לבדוק את תוצאת ההמרה: {error}"))?;
    if metadata.len() > MAX_PDF_BYTES {
      return Err("קובץ ה-PDF שנוצר גדול מדי (מעל 100MB).".into());
    }
    fs::read(&output_path).map(|bytes| STANDARD.encode(bytes)).map_err(|error| format!("לא ניתן לקרוא את תוצאת ההמרה: {error}"))
  })();
  let _ = fs::remove_dir_all(temp_dir);
  result
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
    .invoke_handler(tauri::generate_handler![app_name, remember_recent_file, convert_eps_to_pdf, read_linked_image, stat_linked_images])
    .run(tauri::generate_context!())
    .expect("error while running Imudist");
}
